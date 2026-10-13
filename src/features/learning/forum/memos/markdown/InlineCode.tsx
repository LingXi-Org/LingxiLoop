// Adapted from usememos/memos (MIT), 8120a6cee03003ee7968b49b2109f816fa4d96a4. See README.md and LICENSE.

import type { ExtraProps as ReactMarkdownProps } from "react-markdown";
import { cn } from "@/lib/utils";
import { markdownStyles } from "../markdownStyles";

interface InlineCodeProps extends React.HTMLAttributes<HTMLElement>, ReactMarkdownProps {
  children?: React.ReactNode;
}

/**
 * Inline code component with background and monospace font
 */
export const InlineCode = ({ children, className, node: _node, ...props }: InlineCodeProps) => {
  return (
    <code className={cn(markdownStyles.inlineCode, className)} {...props}>
      {children}
    </code>
  );
};
