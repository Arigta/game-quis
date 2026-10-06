import { json } from "../_shared.js";

export async function onRequestGet({ env }) {
  if (!env.QUESTION_CACHE) return json({ questions: [] });
  const listing = await env.QUESTION_CACHE.list({ prefix: "question:", limit: 1000 });
  const records = await Promise.all(listing.keys.map(key => env.QUESTION_CACHE.get(key.name, "json")));
  const questions = records.filter(item => item?.status === "active").map(item => ({
    id: item.id, q: item.question, a: item.options, c: item.answerIndex,
    e: item.explanation, cat: item.category, trap: item.isTrap,
  }));
  return json({ questions });
}
