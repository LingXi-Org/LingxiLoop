# Reading activity failure model

Written before implementation; all regression inputs are synthetic.

- One knowledge call renders both its existing ToolCall row and a second ProgressTracker card.
- Removing the second card loses distinct public outcomes: unavailable, no matches, no readable text, queued or processing.
- A cancelled, failed or unknown call is incorrectly rendered as successful because an older source status says ready.
- A legacy tool alias bypasses the same rendering rules.
- Compacting status hides authorized summaries, reply text, source links, approval controls or error feedback.
- Streaming-to-history restoration changes the final state or duplicates the call.
- Raw arguments/results or source text leak into the status presentation.

The fix must retain the existing RunActivity/ToolCall component, use only fixed public source-state labels, preserve separate reply/source parts and existing authorization controls, and avoid changing tool execution or delivery.
