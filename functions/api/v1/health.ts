import { handleHealthRoute } from '../../../api/routes/health.route';
import { CloudflareEnv } from '../../../database/types';

interface PagesFunctionEventContext<Env> {
  request: Request;
  env: Env;
  params: Record<string, string | string[]>;
  waitUntil: (promise: Promise<unknown>) => void;
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
  data: Record<string, unknown>;
}

/**
 * Cloudflare Pages Functions entry point for GET /api/v1/health.
 * Automatically deployed and invoked by Cloudflare Pages runtime.
 * Receives Cloudflare bindings (including env.DB for Cloudflare D1) through context.env.
 */
export async function onRequestGet(context: PagesFunctionEventContext<CloudflareEnv>): Promise<Response> {
  return handleHealthRoute(context.request, context.env);
}

/**
 * Cloudflare Pages Functions entry point for OPTIONS preflight /api/v1/health.
 */
export async function onRequestOptions(context: PagesFunctionEventContext<CloudflareEnv>): Promise<Response> {
  return handleHealthRoute(context.request, context.env);
}

/**
 * Catch-all handler for other HTTP methods.
 */
export async function onRequest(context: PagesFunctionEventContext<CloudflareEnv>): Promise<Response> {
  return handleHealthRoute(context.request, context.env);
}
