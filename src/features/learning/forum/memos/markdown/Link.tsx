// Adapted from usememos/memos (MIT), 8120a6cee03003ee7968b49b2109f816fa4d96a4. See README.md and LICENSE.

import type { ExtraProps as ReactMarkdownProps } from "react-markdown";
import { cn } from "@/lib/utils";
import { markdownStyles } from "../markdownStyles";

interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement>, ReactMarkdownProps {
  children?: React.ReactNode;
}

/**
 * Link component for external links
 * Opens in new tab with security attributes
 */
export const Link = ({ children, className, href, node: _node, ...props }: LinkProps) => {
  return (
    <a href={href} target={href?.startsWith('#') ? undefined : '_blank'} rel="noopener noreferrer" className={cn(markdownStyles.link, className)} {...props}>
      {children}
    </a>
  );
};
