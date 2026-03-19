"""
Merge QLoRA LoRA adapter into base model and save as full HuggingFace model.
Then convert to GGUF via llama.cpp for Ollama deployment.

Usage: python merge_and_export.py
"""
import os
import sys
import shutil
import logging

# Fix sys.path to avoid local datasets/ package shadowing HF
_script_dir = os.path.dirname(os.path.abspath(__file__))
sys.path = [p for p in sys.path if os.path.normpath(p) not in (os.path.normpath(_script_dir), "")]

import torch

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(message)s")
log = logging.getLogger(__name__)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("huggingface_hub").setLevel(logging.WARNING)

# Defaults (overridden by CLI args in __main__)
ADAPTER_PATH = os.path.join(_script_dir, "outputs", "qlora_v1", "final")
MERGED_PATH  = os.path.join(_script_dir, "outputs", "qlora_v1", "merged")
GGUF_DIR     = os.path.join(_script_dir, "outputs", "qlora_v1", "gguf")

def merge_lora():
    from transformers import AutoProcessor, BitsAndBytesConfig
    from peft import PeftConfig, PeftModel

    try:
        from transformers import AutoModelForVision2Seq
    except ImportError:
        from transformers import AutoModelForImageTextToText as AutoModelForVision2Seq

    log.info("=" * 60)
    log.info("Step 1: Merge LoRA adapter into base model")
    log.info("=" * 60)

    peft_cfg = PeftConfig.from_pretrained(ADAPTER_PATH)
    base_id = peft_cfg.base_model_name_or_path
    log.info(f"Base model: {base_id}")
    log.info(f"Adapter:    {ADAPTER_PATH}")
    log.info(f"Output:     {MERGED_PATH}")

    log.info("Loading processor...")
    processor = AutoProcessor.from_pretrained(base_id, trust_remote_code=True)

    log.info("Loading base model in bf16 (no quantization for merge)...")
    base_model = AutoModelForVision2Seq.from_pretrained(
        base_id,
        torch_dtype=torch.bfloat16,
        device_map="cuda",
        trust_remote_code=True,
    )
    vram_gb = torch.cuda.memory_allocated() / 1e9
    log.info(f"Base model loaded. VRAM used: {vram_gb:.1f} GB")

    log.info("Applying LoRA adapter...")
    model = PeftModel.from_pretrained(base_model, ADAPTER_PATH)

    log.info("Merging LoRA weights into base model...")
    model = model.merge_and_unload()
    model.eval()
    log.info("Merge complete.")

    log.info(f"Saving merged model to {MERGED_PATH} ...")
    os.makedirs(MERGED_PATH, exist_ok=True)
    model.save_pretrained(MERGED_PATH, safe_serialization=True, max_shard_size="4GB")
    processor.save_pretrained(MERGED_PATH)
    log.info("Merged model saved.")

    # Show saved files
    import glob
    files = sorted(glob.glob(os.path.join(MERGED_PATH, "*")))
    total_gb = sum(os.path.getsize(f) for f in files if os.path.isfile(f)) / 1e9
    log.info(f"Files in {MERGED_PATH}:")
    for f in files:
        if os.path.isfile(f):
            sz = os.path.getsize(f) / 1e6
            log.info(f"  {os.path.basename(f):50s} {sz:.0f} MB")
    log.info(f"Total size: {total_gb:.1f} GB")

    return MERGED_PATH


def setup_llama_cpp():
    """Clone/install llama.cpp if not already present."""
    import subprocess

    llama_dir = os.path.join(_script_dir, "llama.cpp")
    convert_script = os.path.join(llama_dir, "convert_hf_to_gguf.py")

    if os.path.exists(convert_script):
        log.info(f"llama.cpp already at {llama_dir}")
        return llama_dir

    log.info("=" * 60)
    log.info("Step 2: Clone llama.cpp")
    log.info("=" * 60)

    if not os.path.exists(llama_dir):
        log.info("Cloning llama.cpp repository...")
        result = subprocess.run(
            ["git", "clone", "--depth=1", "https://github.com/ggml-org/llama.cpp", llama_dir],
            capture_output=True, text=True
        )
        if result.returncode != 0:
            log.error(f"git clone failed: {result.stderr}")
            raise RuntimeError("Could not clone llama.cpp")
        log.info("llama.cpp cloned.")

    # Install requirements for the convert script
    req_file = os.path.join(llama_dir, "requirements", "requirements-convert_hf_to_gguf.txt")
    if not os.path.exists(req_file):
        req_file = os.path.join(llama_dir, "requirements.txt")
    if os.path.exists(req_file):
        log.info("Installing llama.cpp Python requirements...")
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "-r", req_file], check=True)

    return llama_dir


def convert_to_gguf(merged_path, llama_dir, quantize="Q4_K_M"):
    """Convert merged HF model to GGUF and quantize."""
    import subprocess

    log.info("=" * 60)
    log.info("Step 3: Convert merged model to GGUF")
    log.info("=" * 60)

    os.makedirs(GGUF_DIR, exist_ok=True)
    gguf_f16 = os.path.join(GGUF_DIR, "ptcg-card-reader-f16.gguf")
    gguf_q4  = os.path.join(GGUF_DIR, f"ptcg-card-reader-{quantize}.gguf")

    convert_script = os.path.join(llama_dir, "convert_hf_to_gguf.py")
    if not os.path.exists(convert_script):
        # Try old name
        convert_script = os.path.join(llama_dir, "convert-hf-to-gguf.py")

    if not os.path.exists(convert_script):
        raise FileNotFoundError(f"convert script not found in {llama_dir}")

    log.info(f"Converting to GGUF f16: {gguf_f16}")
    result = subprocess.run(
        [sys.executable, convert_script,
         merged_path,
         "--outtype", "f16",
         "--outfile", gguf_f16],
        capture_output=True, text=True
    )
    if result.stdout:
        log.info(result.stdout[-2000:])
    if result.returncode != 0:
        log.error(f"Conversion failed: {result.stderr[-2000:]}")
        raise RuntimeError("GGUF conversion failed")

    sz_gb = os.path.getsize(gguf_f16) / 1e9
    log.info(f"F16 GGUF saved: {gguf_f16} ({sz_gb:.1f} GB)")

    # Try to find llama-quantize binary
    quantize_bins = [
        os.path.join(llama_dir, "build", "bin", "llama-quantize.exe"),
        os.path.join(llama_dir, "build", "bin", "Release", "llama-quantize.exe"),
        "llama-quantize",
    ]
    quantize_bin = next((b for b in quantize_bins if os.path.exists(b)), None)

    if quantize_bin:
        log.info(f"Quantizing to {quantize}: {gguf_q4}")
        result = subprocess.run(
            [quantize_bin, gguf_f16, gguf_q4, quantize],
            capture_output=True, text=True
        )
        if result.returncode == 0:
            sz_gb = os.path.getsize(gguf_q4) / 1e9
            log.info(f"Quantized GGUF saved: {gguf_q4} ({sz_gb:.1f} GB)")
        else:
            log.warning(f"Quantization failed (binary may need building): {result.stderr[:500]}")
            log.info(f"You can quantize manually: llama-quantize {gguf_f16} {gguf_q4} {quantize}")
    else:
        log.warning("llama-quantize binary not found. You can still use f16 GGUF directly.")
        log.info(f"To quantize manually after building llama.cpp:")
        log.info(f"  llama-quantize {gguf_f16} {gguf_q4} {quantize}")

    return gguf_f16, gguf_q4


def create_modelfile(gguf_path, mmproj_path=None, model_name="ptcg-card-reader"):
    """Generate Ollama Modelfile for the PTCG card reader."""
    log.info("=" * 60)
    log.info("Step 4: Create Ollama Modelfile")
    log.info("=" * 60)

    modelfile_path = os.path.join(GGUF_DIR, "Modelfile")

    from_lines = f"FROM {gguf_path}\n"
    if mmproj_path and os.path.exists(mmproj_path):
        from_lines += f"FROM {mmproj_path}\n"
        log.info(f"Reusing mmproj: {mmproj_path}")

    modelfile_content = f"""{from_lines}
TEMPLATE \"\"\"<|im_start|>system
{{{{ .System }}}}<|im_end|>
<|im_start|>user
{{{{ .Prompt }}}}<|im_end|>
<|im_start|>assistant
\"\"\"

PARAMETER temperature 0
PARAMETER num_predict 512
PARAMETER repeat_penalty 1.15
PARAMETER stop "<|endoftext|>"
PARAMETER stop "<|im_end|>"
PARAMETER stop "<|im_start|>"

SYSTEM \"\"\"You are a Pokemon Trading Card Game card reader. When given a card image, extract ALL visible information and return ONLY a JSON object with these fields: name, hp, types, supertype, rarity, attacks, abilities, retreat_cost, expansion, card_number. No markdown, no explanation.\"\"\"
"""
    with open(modelfile_path, "w", encoding="utf-8") as f:
        f.write(modelfile_content)

    log.info(f"Modelfile saved: {modelfile_path}")
    log.info("")
    log.info("To deploy to Ollama:")
    log.info(f"  ollama create {model_name} -f {modelfile_path}")
    log.info(f"  ollama run {model_name}")
    return modelfile_path


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-merge", action="store_true", help="Skip merge if already done")
    parser.add_argument("--skip-gguf", action="store_true", help="Skip GGUF conversion")
    parser.add_argument("--quantize", default="Q4_K_M", help="GGUF quantization type")
    parser.add_argument("--adapter-path", default=None, help="Path to LoRA adapter (overrides default)")
    parser.add_argument("--output-base", default=None, help="Base output directory (merged/ and gguf/ created inside)")
    parser.add_argument("--model-name", default="ptcg-card-reader", help="Name for Ollama model")
    parser.add_argument("--reuse-mmproj", default=None, help="Path to existing mmproj GGUF to reuse (skips visual encoder conversion)")
    args = parser.parse_args()

    # Override paths if provided
    if args.adapter_path:
        ADAPTER_PATH = os.path.abspath(args.adapter_path)
    if args.output_base:
        base = os.path.abspath(args.output_base)
        MERGED_PATH = os.path.join(base, "merged")
        GGUF_DIR    = os.path.join(base, "gguf")

    if args.skip_merge and os.path.exists(MERGED_PATH):
        log.info(f"Skipping merge — using existing {MERGED_PATH}")
        merged = MERGED_PATH
    else:
        merged = merge_lora()

    if not args.skip_gguf:
        try:
            llama_dir = setup_llama_cpp()
            f16_gguf, q4_gguf = convert_to_gguf(merged, llama_dir, args.quantize)
            gguf_for_modelfile = q4_gguf if os.path.exists(q4_gguf) else f16_gguf
            mmproj = args.reuse_mmproj
            if not mmproj:
                # try auto-detect in same gguf dir
                auto = os.path.join(GGUF_DIR, "mmproj-ptcg-f16.gguf")
                if os.path.exists(auto):
                    mmproj = auto
            create_modelfile(gguf_for_modelfile, mmproj_path=mmproj, model_name=args.model_name)
        except Exception as e:
            log.error(f"GGUF conversion failed: {e}")
            log.info("Merged model is still usable at: " + merged)
            log.info("You can retry GGUF conversion separately with --skip-merge")
    else:
        log.info("Skipping GGUF conversion.")

    log.info("")
    log.info("=" * 60)
    log.info("DONE")
    log.info(f"  Merged HF model: {MERGED_PATH}")
    log.info(f"  GGUF directory:  {GGUF_DIR}")
    log.info("=" * 60)
