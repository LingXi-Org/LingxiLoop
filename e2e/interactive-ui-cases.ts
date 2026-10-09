// M0 uses distinct prompts; the holdout tasks below never set their own gates.
export const interactiveBaselineCases = [
  { id: 'baseline-projectile', component: 'ProjectilePlot', prompt: '做一个小型抛体交互讲解，只调整角度，速度固定10m/s、重力9.81m/s²、起落同高且忽略阻力。先预测20度和70度谁更远，再比较；最后问30度和60度。',
    facts: '等高无阻力下互余角射程相等；20°与70°相同，30°与60°相同。速度10m/s，重力9.81m/s²。' },
  { id: 'baseline-comparison', component: 'Table', prompt: '用一个短交互对照表解释TCP与UDP的传输保证，含预测输入和检查按钮。用实时语音丢失一个包的场景做迁移题。',
    facts: 'TCP提供可靠有序字节流，UDP数据报不保证到达和顺序；实时语音可能权衡延迟与重传，不能声称UDP绝不丢包。' },
] as const

export const interactiveCases = [
  { id: 'projectile', component: 'ProjectilePlot', prompt: '用交互讲解帮我理解抛射运动。请提供角度、速度、重力三个连续参数，从同高无阻力发射开始；我先预测再观察，最后给一个初速度翻倍的迁移题。',
    facts: '无空气阻力、起落等高；R=v² sin(2θ)/g，45度最大；初速度翻倍射程变四倍。角度单位度，速度m/s，重力m/s²。' },
  { id: 'functions', component: 'FunctionPlot', prompt: '做一个交互函数比较：y=ax² 与 y=x，a可调且包含1；显示解析交点。先预测a=1时交点，再给我改成y=2x的未见迁移题。',
    facts: 'a=1时x²=x交点(0,0),(1,1)；迁移x²=2x交点(0,0),(2,4)。a≠0时x²系数改变另一交点。' },
  { id: 'dct', component: 'DctImage', prompt: '用8乘8固定灰度图的交互DCT讲解频域压缩，提供保留系数数量0到64的滑块，对照重建和误差，解释全系数和截断。给一个全保留后能否无损的迁移题。',
    facts: 'DCT正交归一化，全64系数重建只有浮点舍入误差；截断不是无损，保留数量增加平方误差不增；DC对应平均亮度。' },
  { id: 'clt', component: 'CltPlot', prompt: '用交互图解释中心极限定理，分布可选均匀、伯努利、指数，样本量可调。提醒我均值分布与原始样本分布不同，给样本量从25变100的迁移题。',
    facts: '独立同分布且有限方差的样本均值随n增大接近正态；不是原始数据变正态；标准误差σ/√n，从25到100变为一半。' },
  { id: 'monty', component: 'MontyHall', prompt: '用交互实验解释蒙提霍尔：预测后选门、揭示、比较换门，并能重复模拟。说明主持人知道奖品且必开未选空门；迁移题：主持人若随机开门，还能直接用2/3吗？',
    facts: '标准主持人规则下坚持1/3换门2/3；重复模拟接近理论值但不保证每次赢；随机开门的条件不同，不能不加分析直接套2/3。' },
  { id: 'comparison', component: 'Table', prompt: '请用可交互的概念对照表、短解释、预测输入和检查按钮解释TCP可靠传输与TLS保密性的区别。再给一个数据完整到达但被监听的迁移情境。',
    facts: '可靠传输和保密性不同；TCP自身不加密；TLS提供传输机密性和完整性/认证机制；完整到达仍可能被监听，可靠不等于安全。' },
  { id: 'steps', component: 'Steps', prompt: '做一个分步揭示的交互讲解：从y=2x到y=2x+3，含预测输入和检查按钮，让我逐步观察斜率和截距；最后问y=5x-1在x=2的值作为未见迁移题。',
    facts: '加3使图线竖直上移3、斜率仍2；y=5x-1在x=2时为9；截距-1斜率5。' },
  { id: 'mixed', component: 'FunctionPlot', prompt: '请自由组合一个交互讲解，不使用固定实验页：对照表比较线性与二次函数、可调二次系数的两条曲线、两步观察、预测输入和检查动作。解释x²=x的交点后问x²=3x。',
    facts: '线性函数斜率不随x变，二次函数有曲率；x²=x交点(0,0),(1,1)，x²=3x交点(0,0),(3,9)。' },
  { id: 'brief', component: null, prompt: '只用一句纯文本回答，不要交互组件：TCP可靠传输是否自动意味着保密？', facts: '否，TCP可靠不等于加密或保密。' },
  { id: 'unsupported', component: null, prompt: '不用任何已有的抛体或二次函数实验，给我一个可以求任意偏微分方程并联网获取实验数据的运行工具；如果当前不支持，请只用文字说明并给一个学习替代方案。',
    facts: '当前没有任意代码/PDE/联网执行组件；诚实说明限制并提供文字学习替代方案，不伪造已计算或联网结果。' },
] as const
