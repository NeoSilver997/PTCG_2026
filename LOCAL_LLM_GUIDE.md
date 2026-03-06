# Local LLM Battle Parser Setup Guide

## Why Use Local LLM for Battle Parsing?

While the TypeScript parser is more reliable and deterministic, local LLMs can be useful for:

1. **Prototyping** - Quickly test parsing logic on new log formats
2. **Edge cases** - Handle unusual battle log variations
3. **Parser updates** - Generate new parsing rules when the game changes
4. **Debugging** - Understand why certain logs fail to parse
5. **Cost-effective** - No API calls, runs locally

## Setup

### 1. Install Ollama (Already Done)
```bash
# Verify installation
ollama --version
ollama list
```

### 2. Use the Parser Scripts

#### Basic Usage
```bash
# Parse a single battle log
node local-battle-parser.js sample-battle-log.txt

# Parse all logs in a directory
node local-battle-parser.js --batch /path/to/logs/
```

#### Advanced Interactive Mode
```bash
node advanced-battle-parser.js --interactive
```

#### Compare with Existing Parser
```bash
node advanced-battle-parser.js --compare sample-battle-log.txt
```

## Best Practices for LLM Parsing

### 1. Prompt Engineering
- **Be specific** about the expected JSON structure
- **Include examples** in the prompt when possible
- **Use chain-of-thought** reasoning for complex parsing
- **Define clear rules** for each action type

### 2. Temperature Settings
For consistent results, use lower temperature:
```bash
ollama run deepseek-coder-v2:16b --temperature 0.1
```

### 3. Error Handling
- **Validate JSON output** - LLMs can hallucinate invalid structures
- **Fallback to regex** for critical parsing
- **Log failures** for manual review
- **Retry with different prompts** if parsing fails

### 4. Performance Optimization
- **Cache results** - Don't re-parse the same logs
- **Batch processing** - Parse multiple logs in one session
- **Stream processing** - For very large log files

## Integration with Existing System

### Hybrid Approach
```javascript
// Use LLM for initial parsing, fallback to TypeScript parser
async function parseBattleLog(logText) {
  try {
    const llmResult = await llmParser.parse(logText);
    if (isValidResult(llmResult)) {
      return llmResult;
    }
  } catch (error) {
    console.warn('LLM parsing failed, using TypeScript parser');
  }

  // Fallback to existing parser
  return typescriptParser.parseLogText(logText);
}
```

### API Endpoint
Add a new endpoint that uses LLM parsing:
```typescript
@Post('parse-with-llm')
async parseWithLLM(@Body() dto: CreateBattleLogDto) {
  const llmParser = new LocalBattleParser();
  const result = await llmParser.parseBattleLog(dto.rawLog);
  return result;
}
```

## Common Issues & Solutions

### Issue: Inconsistent Results
**Solution**: Use lower temperature, add more specific prompts, validate output structure

### Issue: Hallucinated Data
**Solution**: Add strict validation, cross-reference with known card data

### Issue: Slow Processing
**Solution**: Use smaller models for simple parsing, cache frequent patterns

### Issue: Complex Log Formats
**Solution**: Break down into smaller chunks, use multi-step parsing

## Model Recommendations

- **deepseek-coder-v2:16b** - Good balance of speed and accuracy
- **qwen2.5-coder:14b** - Faster, good for simple parsing
- **codellama:13b-python** - Specialized for code-like structured data

## Testing Your Setup

1. Test with the sample battle logs:
```bash
node local-battle-parser.js sample-battle-log.txt
```

2. Compare results with the existing API:
```bash
# Parse with existing API
curl -X POST http://localhost:4000/api/v1/battles \
  -H "Content-Type: application/json" \
  -d @sample-battle-log.txt

# Parse with LLM
node local-battle-parser.js sample-battle-log.txt
```

3. Validate the output structure matches the expected schema

## Advanced Features

### Custom Prompts
Create specialized prompts for different battle formats:
```javascript
const prompts = {
  standard: '...',
  expanded: '...',
  legacy: '...'
};
```

### Multi-Model Ensemble
Use multiple models and combine results:
```javascript
const results = await Promise.all([
  llamaParser.parse(log),
  qwenParser.parse(log),
  deepseekParser.parse(log)
]);
return combineResults(results);
```

### Fine-tuning
For best results, fine-tune on your battle log dataset:
```bash
# Export training data
# Fine-tune model
ollama create ptcg-parser -f Modelfile
```