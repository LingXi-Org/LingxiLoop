"use client";

import type { GenerativeUILibrary } from "@assistant-ui/react-generative-ui";
import { defaultGenerativeUILibrary } from "@assistant-ui/react-generative-ui";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cloneElement, isValidElement, type ReactNode } from 'react';
import { MessageFooterContents } from '../message-footer';

const markdownBase = defaultGenerativeUILibrary.Markdown!;
const cardBase = defaultGenerativeUILibrary.Card!;

const CardWithMessageFooter: typeof cardBase.render = (props) => {
  const card = cardBase.render(props)
  return isValidElement<{ children?: ReactNode }>(card)
    ? cloneElement(card, {}, <MessageFooterContents>{card.props.children}</MessageFooterContents>) : card
}

/** `MarkdownTextPrimitive` cannot be reused here: it reads from message-part context, not a prop string. */
export const styledGenerativeUILibrary: GenerativeUILibrary = {
  ...defaultGenerativeUILibrary,
  Card: { ...cardBase, render: CardWithMessageFooter },
  Markdown: {
    properties: markdownBase.properties,
    streamProperties: markdownBase.streamProperties,
    description: "A markdown string, rendered with GitHub-flavored markdown.",
    render: ({ value, children }) => (
      <div data-aui="markdown">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{value ?? ""}</ReactMarkdown>
        {children}
      </div>
    ),
  },
};
