---
title: Example Philosophical Prompt
prompt-vars:
  - name: client_name
    type: string
    required: true
    description: Name of the client
  - name: session_date
    type: date
    required: false
    default: tp.date.now()
  - name: topic
    type: string
    required: true
    description: Main topic to explore
aliases:
  - demo
  - sample
tags:
  - philosophy
  - counseling
---

# Philosophical Exploration: {{topic}}

Hello {{client_name}},

Today is {{session_date:tp.date.now()}}, and we're going to explore the topic of **{{topic}}**.

## Key Questions for Reflection

1. How does {{topic}} relate to your current life situation?
2. What philosophical traditions might offer insight into {{topic}}?
3. What questions arise for you when you contemplate {{topic}}?

---

_Generated on tp.date.now() from tp.file.title_
