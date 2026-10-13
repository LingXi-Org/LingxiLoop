// Adapted from usememos/memos (MIT), 8120a6cee03003ee7968b49b2109f816fa4d96a4. See README.md and LICENSE.


import type { ExtraProps as ReactMarkdownProps } from "react-markdown";
import { cn } from "@/lib/utils";
import { markdownStyles } from "../markdownStyles";

interface BlockquoteProps extends React.BlockquoteHTMLAttributes<HTMLQuoteElement>, ReactMarkdownProps {
  children?: React.ReactNode;
}

/**
 * Blockquote component with left border accent
 */
export const Blockquote = ({ children, className, node: _node, ...props }: BlockquoteProps) => {
  return (
    <blockquote className={cn(markdownStyles.blockquote, className)} {...props}>
      {children}
    </blockquote>
  );
};
