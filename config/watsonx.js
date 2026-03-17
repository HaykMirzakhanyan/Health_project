/**
 * config/watsonx.js
 * IBM Watsonx AI client configuration and shared text-generation helper.
 * All four agents import `generateText` from here — one consistent interface.
 *
 * In production: store WATSONX_API_KEY and WATSONX_PROJECT_ID in a secrets
 * manager (IBM Secrets Manager, HashiCorp Vault, etc.) rather than .env.
 */

'use strict';

const { WatsonXAI } = require('@ibm-cloud/watsonx-ai');
const { IamAuthenticator } = require('ibm-cloud-sdk-core');

// ---------------------------------------------------------------------------
// Lazy singleton Watsonx client
// The IamAuthenticator validates `apikey` at construction time, so we defer
// instantiation until the first actual API call.  This lets the server start
// and seed data load successfully even when WATSONX_API_KEY is not yet set
// in the environment (e.g. during CI or local development without credentials).
// ---------------------------------------------------------------------------
let _watsonxAIService = null;

function getClient() {
  if (!_watsonxAIService) {
    if (!process.env.WATSONX_API_KEY) {
      throw new Error(
        'WATSONX_API_KEY is not set. Add it to your .env file before calling the AI agents.'
      );
    }
    _watsonxAIService = WatsonXAI.newInstance({
      version: '2024-05-31',
      serviceUrl: process.env.WATSONX_URL || 'https://us-south.ml.cloud.ibm.com',
      authenticator: new IamAuthenticator({
        apikey: process.env.WATSONX_API_KEY,
      }),
    });
  }
  return _watsonxAIService;
}

// Expose a getter for the client (used by tests and direct SDK callers)
const watsonxAIService = new Proxy(
  {},
  {
    get(_, prop) {
      return getClient()[prop];
    },
  }
);

// ---------------------------------------------------------------------------
// generateText — wraps the Watsonx text generation API
//
// @param {string} prompt        — The full prompt string to send to the model
// @param {Object} [options]     — Optional overrides
//   @param {string} [options.modelId]     — Override the default model
//   @param {number} [options.maxTokens]   — Max tokens to generate (default 1000)
//   @param {number} [options.temperature] — Sampling temperature (default 0.3)
// @returns {Promise<string>}    — Trimmed generated text
// ---------------------------------------------------------------------------
async function generateText(prompt, options = {}) {
  const client = getClient();

  const params = {
    modelId:
      options.modelId ||
      process.env.WATSONX_MODEL_ID ||
      'ibm/granite-3-8b-instruct',
    projectId: process.env.WATSONX_PROJECT_ID,
    input: prompt,
    parameters: {
      max_new_tokens: options.maxTokens || 1000,
      temperature: options.temperature || 0.3,
      repetition_penalty: 1.1,
    },
  };

  const response = await client.generateText(params);
  return response.result.results[0].generated_text.trim();
}

// ---------------------------------------------------------------------------
// parseJSON — extracts and parses a JSON block from an LLM response.
//
// LLMs often wrap JSON in markdown code fences (```json ... ```).
// This helper strips the fences and parses what remains.
// Falls back to attempting a direct parse on the raw text.
//
// @param {string} text — Raw LLM output
// @returns {*}         — Parsed JavaScript value
// @throws              — If no valid JSON can be found
// ---------------------------------------------------------------------------
function parseJSON(text) {
  // 1. Try to extract a fenced code block: ```json ... ``` or ``` ... ```
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch (_) {
      // Fall through to next strategy
    }
  }

  // 2. Try to find the first `[` or `{` and parse from there
  const firstBracket = text.search(/[\[{]/);
  if (firstBracket !== -1) {
    // Find the matching closing bracket by slicing from first bracket
    const jsonCandidate = text.slice(firstBracket);
    try {
      return JSON.parse(jsonCandidate);
    } catch (_) {
      // Fall through to last-resort direct parse
    }
  }

  // 3. Last resort — parse the whole trimmed text
  return JSON.parse(text.trim());
}

module.exports = { watsonxAIService, generateText, parseJSON };
