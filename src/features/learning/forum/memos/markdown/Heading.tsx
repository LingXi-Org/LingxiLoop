// Adapted from usememos/memos (MIT), 8120a6cee03003ee7968b49b2109f816fa4d96a4. See README.md and LICENSE.

import type { ExtraProps as ReactMarkdownProps } from "react-markdown";
import { cn } from "@/lib/utils";
import { headingClass } from "../markdownStyles";

interface HeadingProps extends React.HTMLAttributes<HTMLHeadingElement>, ReactMarkdownProps {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children?: React.ReactNode;
}

/**
 * Heading component for h1-h6 elements.
 * Renders semantic heading levels with consistent styling.
 * Anchor IDs are assigned by the rehypeHeadingId plugin.
 */
export const Heading = ({ level, children, className, node: _node, ...props }: HeadingProps) => {
  const Component = `h${level}` as const;

  return (
    <Component className={cn(headingClass(level), className)} {...props}>
      {children}
    </Component>
  );
};
