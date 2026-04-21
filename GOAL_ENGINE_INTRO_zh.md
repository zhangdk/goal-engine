# 🚀 Goal Engine: 目标持久化与行为演进引擎 (Introduction)

[English](GOAL_ENGINE_INTRO.md) | [中文](GOAL_ENGINE_INTRO_zh.md)

> **“让 Agent 不仅仅是执行者，而是不达目的誓不罢休的进化体。”**

## 1. 项目愿景 (Vision)
`goal-engine` 是一个专为自主 Agent 设计的**目标治理与行为演进系统**。它通过将 Agent 行为从“过程日志”转向“**平台事实（Platform Facts）**”，实现了从反应式预测到事实驱动进化的跨越。

在 `goal-engine` 的逻辑中，任务不是一次性的 Prompt 交互，而是一个**受合约约束、由事实支撑、且必须被证据证明的生命周期**。

---

## 2. 核心架构：平台事实基础 (Platform Facts Foundation)

![Goal Engine Architecture](assets/images/architecture.svg)

*   **目标合约 (Goal Contract)**：任务开始即建立合约，明确预期结果、成功证据标准和自主边界。这彻底杜绝了 Agent 对成功的“幻觉”。
*   **尝试证据 (Attempt Evidence)**：Agent 的每一次关键进展或阻碍都记录为一等公民证据（交付物、外部事实、渠道检查）。过程是数据，证据才是真相。
*   **证据引用完成 (Evidence-backed Completion)**：目标不能被简单“标记完成”，而必须通过引用满足合约要求的特定证据 ID 来“证明完成”。
*   **中心化大脑**：基于 SQLite 的持久化后端，存储不可篡改的事实基础，并跨 Agent 同步认知策略。

---

## 3. 核心竞争力：与同类范式的区别 (Differentiation)

### A. 与主流 Harness Engineering 的本质区别
| 维度 | 主流 Harness Engineering (如 OpenHarness) | Goal Engine (平台事实) |
| :--- | :--- | :--- |
| **信任模型** | **隐式**：Agent 声称已完成 | **显式**：Agent 通过证据 ID 证明已完成 |
| **持久化** | **无状态**：Session 结束即销毁 | **事实基础**：不可篡改的证据历史 |
| **目标追踪** | **漂移**：基于 Prompt 的模糊目标 | **合约化**：强制执行的目标合约 |
| **完成定义** | **补丁式**：直接修改 `status = "completed"` | **引用式**：完成记录必须链接到具体证据 |

### B. 与同类 Agent 产品的对比
*   **Vs. MemGPT / Letta**：MemGPT 侧重于“上下文记忆”，`goal-engine` 侧重于“**基于事实的行为治理**”。
*   **Vs. NVIDIA Voyager**：Voyager 验证了代码级技能演进，`goal-engine` 带来了生产级的**目标合约与证据验证闭环**。

---

## 4. 生态位：事实协议与演进 (Ecosystem)

*   **平台事实协议 (Platform Fact Protocol)**：通过 `shared/types.ts` 定义跨环境（浏览器、服务器、CLI）的通用证据语言。
*   **零信任完成**：未来版本将实现证据对合约的自动语义验证，确保没有任何 Agent 能够“伪造”成功结果。

---

**Goal Engine 不仅仅是在管理任务，它是在通过不可篡改的平台事实基础工程化“意志”。**
