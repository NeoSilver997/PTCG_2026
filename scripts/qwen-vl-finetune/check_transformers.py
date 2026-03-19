import transformers
print("transformers version:", transformers.__version__)

# Check available auto model classes
classes = [x for x in dir(transformers) if 'Auto' in x and 'Model' in x]
print("Auto model classes:", classes[:20])

# Check specific classes
for cls_name in ['AutoModelForVision2Seq', 'AutoModelForImageTextToText', 'AutoModelForCausalLM']:
    has = hasattr(transformers, cls_name)
    print(f"  {cls_name}: {'YES' if has else 'NO'}")
