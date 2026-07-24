---
name: grill
description: Interview the user relentlessly about a plan or design until reaching shared understanding, resolving each branch of the decision tree. Use when user wants to stress-test a plan, or uses any 'grill' trigger phrases.
metadata: 
  description: Adapted version of `grill-me` to include allowing multiple questions at once.
---

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Questions that don't depend on sequential decisions can be asked in parallel. If a question can be answered by exploring the codebase, explore the codebase instead.

Upon completion, prompt if we should save the interview to `/docs/interviews/` with a YYYY-MM-DD prefix.