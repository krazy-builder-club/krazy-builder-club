# Project BOB (Bank-Organized Brain) 
**Team:** krazybuildersclub

## 🚨 The Problem
Banks possess petabytes of customer data trapped in relational databases that track numbers, not life events. Because this data lacks semantic meaning, bank interactions remain reactive and generic, forcing customers to handle the mental overhead of their financial lives.

## 💡 Our Solution
We created a scalable, autonomous Digital Twin Cognitive Layer that transforms KBC into a proactive life partner. Using the **Model Context Protocol (MCP)**, we translate raw, siloed banking data into a personalized "BOB" (Bank-Organized Brain) for each of KBC's 2.3 million customers. 

Each BOB consists of three standardized, LLM-interpretable Markdown files: 
* `situation.md`
* `personality.md`
* `experience.md`

This radically simplifies complex data into context-rich narratives that AI agents can easily understand and act upon without burning massive token limits.

## ⚙️ How It Works
* **The Librarian Agent:** Operates asynchronously, listening to financial signals (e.g., new recurring debits, salary changes) and updating the customer's Markdown files to reflect their real-time life stage.
* **The Actor Agent (Intra-Personal):** Analyzes the individual's brain to eliminate micro-frictions. If a customer stops swiping their card at the gym for months, the agent pushes a one-tap cancellation prompt via the KBC app, saving them time and money.
* **The Actor Agent (Inter-Personal):** Uses anonymized vector clustering to compare life trajectories across populations. If a user's behavioral footprint matches a cohort of young families transitioning from renting to buying, the agent proactively generates a pre-approved mortgage roadmap before the customer even asks.

## 🔒 Security & Tech Stack
Built on **Google Cloud Platform, Claude, and GitHub**, the architecture guarantees enterprise-grade security. 
* No raw PII is exposed to the LLM context windows; the Markdown brains utilize pseudonymized tokens. 
* The entire deployment pipeline is secured and audited by **Aikido** (SAST/SCA/secrets scanning) to ensure zero data leakage, full GDPR compliance, and strict differential privacy at scale.
