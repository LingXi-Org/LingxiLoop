// Matches the installed Streamdown math plugin's remark-math/rehype-katex syntax.
// Keep formatting at generation time: code and historical messages stay literal.
export const MATH_MARKDOWN_RULES = String.raw`Write mathematical expressions in the public Markdown answer using LaTeX: $QK^{\mathsf T}$ or $\sqrt{d_k}$ for inline math; for display math put $$ on separate lines around the formula. For example:
$$
\operatorname{Attention}(Q,K,V)=\operatorname{softmax}\left(\frac{QK^{\mathsf T}}{\sqrt{d_k}}\right)V
$$
Use LaTeX for fractions, roots, subscripts, matrices, sums and aligned derivations. Do not wrap mathematical explanations or formulas in inline backticks or fenced code blocks (including latex/tex fences); reserve code formatting for actual code or explicitly requested literal source. Use these dollar delimiters instead of \(...\) or \[...\]. Escape literal currency dollar signs as \$ outside code. Preserve literal code and source examples when requested. `
