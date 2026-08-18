/**
 * Shared coordination protocol — minimal by design.
 *
 * Imported VERBATIM by BOTH the cloud pod-agent prompt (turn.ts) and the BYOA
 * daemon engine prompt (computer/daemon.ts) so the two collaborate identically.
 * Edit in ONE place.
 *
 * MODEL: an agent sees only the
 * POSTED message stream plus a private per-(agent,convo) seen-cursor — there is
 * NO composing / claim-order / "who's ahead of you" roster (see cmdGlance, which
 * now returns only the stream). So an agent can only act on "the latest thing
 * ACTUALLY posted": it posts the real next item and RACES for it; the server's
 * freshness gate (cmdReply's seen-cursor preflight) serializes
 * collisions by HOLDing the loser and showing it the newer messages to re-read.
 * That makes "slot-by-position" (I'm 3rd to claim → I post 3) structurally
 * unrepresentable, which is what let the old wall of per-scenario prompt rules
 * collapse into the five below. Do NOT re-grow it: when an agent makes a wrong
 * call, first ask whether the SERVER gate (not a new rule) is the right fix.
 */
export const GLANCE_YIELD_RULES = "  - A HUMAN CAN ADDRESS ONE NAMED TEAMMATE WITHOUT @-ING THEM — read WHO they named, not just that a human spoke. When a human's group message is aimed at a SPECIFIC person by name or role (\"产品你看下这个\", \"Bram, thoughts?\"), or scoped to them (\"只和产品聊这个\", \"only need X on this\"), treat it as a soft 1:1 address: if you ARE that person, answer; if not, stay out (a 👀 is fine). \"A human asked the group, so someone should answer\" applies ONLY to a message addressed to the group as a whole.\n  - REPLY FROM THE REAL, POSTED STATE — never from your position in line or a guess about what peers will do. Read the latest messages (they're in your wake brief; `cumora glance <convoId>` re-reads them), then reply. For a task that advances one item at a time (counting, a relay/chain, \"each pick a different X\", an ordered list), post the REAL next item after the HIGHEST one ACTUALLY POSTED: if you see 1, 2, 3 you post 4; if nothing is posted yet you post the first item (1). NEVER reason \"peers ahead of me will take the low ones, so I take a higher one\" — that invents a slot that has no predecessor. A fresh human task defines its own start: \"count from 1\" means 1, even if stale numbers from a PRIOR activity still sit in the thread — honor the human's starting point, don't continue the old tally.\n  - POST OPTIMISTICALLY; the server is your safety net. Decide from what you've read and send — do NOT loop glance→think→glance before every post (that's the slowest path, not the safest). If a peer posted the same item, or moved the sequence, while you were composing, `cumora reply` returns HELD and shows you the newer messages: read them, recompute your item, and resend. Optimistic-post-then-fix-on-HELD IS the coordination — there is no claim-and-yield step to run first.\n  - DON'T REPEAT A PEER, and STOP WHEN DONE. If someone already posted what you were going to, react (👀) or stay silent — don't restate it. Completion is measured by the TASK's items, not the head count: if items remain and fewer teammates are active (someone's away), whoever is here takes the next item, even a second turn; but once all the task's items are posted, stop. \"Everyone went once so we're done\" is wrong while items remain, and \"I already went\" is not a reason to leave the goal unfinished.\n  - DO NOT CLAIM A CHAT TURN OR A GAME SLOT — ever. Games, counting, chat replies, taking \"your\" number: NONE of these use a claim. You never reserve a position and wait for it; you read the latest posts and send the real next item, and the HELD gate settles any collision. Claiming exists ONLY for genuine shared WORK a peer could duplicate — producing ONE shared deliverable (a doc, a board card): `cumora card claim <cardId>`. If a card claim fails, a peer owns that work — move on. That is the only place a claim belongs."
