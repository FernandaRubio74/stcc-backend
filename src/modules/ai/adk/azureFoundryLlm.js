/**
 * Adaptador de modelo para el Google ADK (Agent Development Kit) sobre el
 * cliente HTTP de Azure AI Foundry que ya existia (`ai.client.js`).
 *
 * El ADK esta pensado por default para modelos Gemini, pero su clase base
 * `BaseLlm` es justamente el punto de extension documentado para enchufar
 * cualquier otro proveedor: implementando `generateContentAsync` alcanza
 * para que `LlmAgent`/`Runner` puedan correr un agente real contra Azure,
 * sin tener que migrar el proveedor de IA (que ya esta probado y en
 * produccion) a Gemini/Vertex solo para poder usar el framework.
 */
const { BaseLlm } = require('@google/adk');
const { completeWithRetry } = require('../ai.client');

function partsToText(parts) {
  return (parts || []).map((part) => part.text || '').join('');
}

// Gemini (y por lo tanto el ADK) usa roles 'user'/'model'; nuestro cliente
// de Azure (superficie compatible con OpenAI) usa 'user'/'assistant'.
function contentsToMessages(contents) {
  return (contents || [])
    .map((content) => ({
      role: content.role === 'model' ? 'assistant' : 'user',
      content: partsToText(content.parts),
    }))
    .filter((message) => message.content.length > 0);
}

function systemInstructionToText(systemInstruction) {
  if (!systemInstruction) return '';
  if (typeof systemInstruction === 'string') return systemInstruction;
  if (Array.isArray(systemInstruction)) return systemInstruction.map(systemInstructionToText).join('\n');
  if (systemInstruction.parts) return partsToText(systemInstruction.parts);
  return '';
}

class AzureFoundryLlm extends BaseLlm {
  /**
   * @param {{model?: string, maxOutputTokens?: number, deps?: object}} params
   *   `deps` se reenvia tal cual a `completeWithRetry` (ver ai.client.js):
   *   es lo que permite a los tests inyectar un `fetch` falso sin pegarle a
   *   Azure de verdad, igual que antes de esta migracion.
   */
  constructor({ model = 'azure-ai-foundry', maxOutputTokens, deps = {} } = {}) {
    super({ model });
    this.maxOutputTokens = maxOutputTokens;
    this.deps = deps;
  }

  async *generateContentAsync(llmRequest) {
    const systemPrompt = systemInstructionToText(llmRequest.config?.systemInstruction);
    const messages = contentsToMessages(llmRequest.contents);

    const text = await completeWithRetry({ systemPrompt, messages, maxOutputTokens: this.maxOutputTokens }, this.deps);

    yield {
      content: { role: 'model', parts: [{ text }] },
      finishReason: 'STOP',
    };
  }

  async connect() {
    throw new Error('AzureFoundryLlm no soporta conexiones live/streaming (solo generacion de un turno)');
  }
}

module.exports = { AzureFoundryLlm };
