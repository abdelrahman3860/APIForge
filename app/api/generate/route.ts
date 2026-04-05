import Groq from 'groq-sdk';
import { NextRequest } from 'next/server';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `You are APIForge — an expert API code generator. Given a plain English description, you research the best npm packages and generate a complete, production-ready Express.js API.

Respond with EXACTLY this structure (use these exact delimiters, nothing outside them):

===APPROACH===
2–3 sentences: what you're building, which npm packages you're using, and why they're the best choice.
===END_APPROACH===

===SERVER_JS===
// Complete server.js — fully working, no placeholders
const express = require('express');
// ... full implementation
===END_SERVER_JS===

===PACKAGE_JSON===
{
  "name": "generated-api",
  ...complete package.json with all dependencies...
}
===END_PACKAGE_JSON===

===ENV_EXAMPLE===
# Required environment variables
API_KEY=your_secret_api_key_here
PORT=3000
...any others needed
===END_ENV_EXAMPLE===

===DEPLOY===
# Deploy to Railway in 3 commands:
npm install -g @railway/cli
railway login
railway init && railway up

# Your API will be live at the Railway URL.
# Set environment variables in Railway dashboard → Variables tab.
===END_DEPLOY===

Rules for the Express API:
- API key auth middleware: check the X-API-Key header against process.env.API_KEY — reject with 401 if missing/wrong
- CORS enabled for all origins (cors package)
- All routes return JSON with { success, data } or { success: false, error, message }
- Input validation with descriptive errors
- 404 handler and global error handler at the bottom
- Use the best available npm packages — never stub the real logic
- If an external API key is required (e.g. YouTube Data API), add it to .env.example with clear instructions
- Include helpful comments explaining each endpoint
- Listen on process.env.PORT || 3000`;

export async function POST(req: NextRequest) {
  const { request } = await req.json();

  if (!process.env.GROQ_API_KEY) {
    return Response.json({ error: 'GROQ_API_KEY not set' }, { status: 500 });
  }

  if (!request?.trim()) {
    return Response.json({ error: 'Request is required' }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      try {
        const stream = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 8192,
          stream: true,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: request.trim() },
          ],
        });

        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content ?? '';
          if (text) controller.enqueue(encoder.encode(text));
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Generation failed';
        controller.enqueue(encoder.encode(`\n\nERROR: ${msg}`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
