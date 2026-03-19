"""Test if removing modules_to_save causes RuntimeError by checking loss.requires_grad."""
import torch
import os, sys
sys.path.insert(0, os.path.dirname(__file__))

from PIL import Image
from pathlib import Path
from transformers import AutoProcessor, BitsAndBytesConfig, AutoModelForVision2Seq
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training, TaskType

model_name = "Qwen/Qwen2.5-VL-7B-Instruct"
print("Loading processor...")
processor = AutoProcessor.from_pretrained(model_name, trust_remote_code=True)

print("Loading model (4-bit)...")
bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.bfloat16,
    bnb_4bit_use_double_quant=True,
)
model = AutoModelForVision2Seq.from_pretrained(
    model_name,
    quantization_config=bnb_config,
    device_map="auto",
    trust_remote_code=True,
    torch_dtype=torch.bfloat16,
)

# Test WITH and WITHOUT modules_to_save
for include_lm_head in [True, False]:
    print(f"\n=== modules_to_save=[lm_head]={include_lm_head} ===")
    
    # Prepare for kbit training
    m = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True,
                                         gradient_checkpointing_kwargs={"use_reentrant": False})
    
    # LoRA config
    modules = ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"]
    lora_cfg = LoraConfig(
        r=16, lora_alpha=32, lora_dropout=0.05, bias="none",
        task_type=TaskType.CAUSAL_LM, target_modules=modules,
        modules_to_save=["lm_head"] if include_lm_head else [],
        inference_mode=False
    )
    peft_m = get_peft_model(m, lora_cfg)
    
    trainable = sum(p.numel() for p in peft_m.parameters() if p.requires_grad)
    print(f"Trainable params: {trainable/1e6:.1f}M")
    
    # Create a simple sample
    img = Image.new("RGB", (120, 168), color=(128, 128, 128))
    conv = [
        {"role": "user", "content": [
            {"type": "image", "image": img},
            {"type": "text", "text": "Extract card info."}
        ]},
        {"role": "assistant", "content": [{"type": "text", "text": '{"name":"Test"}'}]}
    ]
    
    inputs = processor.apply_chat_template(conv, tokenize=True, add_generation_prompt=False,
                                            return_dict=True, return_tensors="pt")
    inputs = {k: v.to("cuda") if hasattr(v, "to") else v for k, v in inputs.items()}
    
    # Make labels
    labels = inputs["input_ids"].clone()
    labels[0, :-5] = -100  # Mask most, keep last 5 tokens
    inputs["labels"] = labels
    
    try:
        with torch.autocast("cuda", dtype=torch.bfloat16):
            outputs = peft_m(**inputs)
        loss = outputs.loss
        print(f"loss: {loss.item():.4f}, requires_grad: {loss.requires_grad}, grad_fn: {loss.grad_fn is not None}")
        
        # Try backward
        loss.backward()
        print(f"BACKWARD OK - no error!")
        peft_m.zero_grad()
    except Exception as e:
        print(f"ERROR: {e}")
    
    # Clean up PEFT for next iteration
    del peft_m
    torch.cuda.empty_cache()
    
print("\nDone.")
