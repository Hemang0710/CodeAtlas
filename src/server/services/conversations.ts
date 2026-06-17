import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import {
  conversations,
  messages,
  type Conversation,
  type Message,
} from "@/server/db/schema";

/**
 * Conversations service. The agent calls `appendMessage` after each user
 * turn AND after each assistant turn; the chat UI calls `listMessages` to
 * replay history when a previous conversation is opened.
 */

export async function createConversation(args: {
  repoId: string;
  title?: string;
}): Promise<Conversation> {
  const [row] = await db
    .insert(conversations)
    .values({
      repoId: args.repoId,
      title: args.title ?? "New conversation",
    })
    .returning();
  return row;
}

export async function listConversationsForRepo(
  repoId: string,
): Promise<Conversation[]> {
  return db
    .select()
    .from(conversations)
    .where(eq(conversations.repoId, repoId))
    .orderBy(desc(conversations.updatedAt));
}

export async function getConversation(
  id: string,
): Promise<Conversation | null> {
  const [row] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * Verify a conversation belongs to a repo. The chat route uses this so a
 * URL-tampered repo id can't read another repo's conversation history.
 */
export async function getConversationForRepo(
  conversationId: string,
  repoId: string,
): Promise<Conversation | null> {
  const [row] = await db
    .select()
    .from(conversations)
    .where(
      and(eq(conversations.id, conversationId), eq(conversations.repoId, repoId)),
    )
    .limit(1);
  return row ?? null;
}

export async function renameConversation(id: string, title: string): Promise<void> {
  await db
    .update(conversations)
    .set({ title: title.slice(0, 200), updatedAt: sql`now()` })
    .where(eq(conversations.id, id));
}

export async function deleteConversation(id: string): Promise<void> {
  await db.delete(conversations).where(eq(conversations.id, id));
}

export async function listMessages(conversationId: string): Promise<Message[]> {
  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt);
}

export interface AppendMessageInput {
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  /** UIMessage `parts` array from the AI SDK. Pass [] for pure-text turns. */
  parts: unknown;
}

export async function appendMessage(input: AppendMessageInput): Promise<Message> {
  const [row] = await db
    .insert(messages)
    .values({
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      parts: input.parts as never,
    })
    .returning();
  // Bump the conversation's updatedAt so the list sorts by recency.
  await db
    .update(conversations)
    .set({ updatedAt: sql`now()` })
    .where(eq(conversations.id, input.conversationId));
  return row;
}
