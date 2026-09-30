# Demo and Delivery Reference

## Selected Narrative

Moving-related assistance is the selected synthetic scenario. Proactor evaluates the 30-day need `move_planning_help` against observed reference outcome `requested_move_planning_help`:

1. Send synthetic inputs including an explicit moving statement.
2. Inspect raw evidence and the separate personality/situation memory; ask a grounded question.
3. Run a scheduled Proactor review using a controlled demo clock, without a new customer action.
4. Show a supported insight, uncertainty, and delivery to a configured webhook consumer.
5. Submit a correction that a task is already handled; show memory change and suppression of the dependent insight.
6. Show a differing customer or no-action case, and demonstrate duplicate input/delivery handling.

The working video plan proposes a concrete version of this narrative: a synthetic renting family whose home is getting too small, corrected by the customer to a renovation. See [video and product description plan](plans/video-and-product-description.md).

That teammate draft is preserved as a story candidate. Before recording, map its three-file view onto the canonical tree in [data](data.md#memory-contract) (`situation/`, `personality/`, `experience/` folders plus overview and evidence), its six-month/22-match examples with the selected 30-day/top-ten reference policy, and its 07:00 clock with Monday 09:00 Brussels (07:00 UTC only during summer time). Household facts need explicit supported input, not a presumed child-benefit interpretation. Root presentation drafts also mention MCP, vector clustering, Claude and unverified production/security claims; they do not override the selected API-only Vertex/heuristic design or establish implemented guarantees.

Compute cohort counts from fixtures and label them synthetic. A manual demo-clock advance must be disclosed as simulating the schedule, not presented as a live Monday run. Show only working features.

## Presentation Work

The latest discussion mentions a two-hour video/speech window, a couple of minutes of demo, and someone owning the presentation. The final sentence is truncated. This does not establish a two-hour video requirement, a due time, or assigned owners. Confirm the presentation format and actual deadline during planning.

Suggested outputs after implementation: a short spoken explanation, architecture/role visual, reproducible demo narrative, and recorded working journey. These are future tasks; no video or deck is created during onboarding.

## Source-Reported Submission Rules

The supplied README reports that the Tectonic participant guide requires a short description, video under three minutes, repository link, and Aikido screenshots; security audit is reported as 10% of assessment. It also reports public repository access through judging and no changes after final submission.

The original guide is unavailable here. These are secondary-source claims, not independently verified rules. Confirm them against the actual guide before submission. Preserve baseline and post-fix audit evidence when the audit is performed; do not claim audit completion now.

The final repository overview should foreground verified run commands, working behavior, and unfinished work. No production or real-world predictive claims follow from the synthetic demonstration.
