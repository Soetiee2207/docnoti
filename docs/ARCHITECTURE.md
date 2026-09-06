# docnoti Architecture

## 1. Purpose

This document defines the technical architecture of docnoti.

It translates the product requirements defined in:

`docs/SPEC.md`

into:

- system architecture
- module boundaries
- data flow
- domain responsibilities
- processing pipeline
- external integration boundaries
- storage responsibilities
- background processing
- failure recovery
- privacy boundaries
- testing boundaries
- architectural constraints

This document answers:

> How should docnoti be structured and how should its components interact?

Product requirements are defined by `docs/SPEC.md`.

If this document conflicts with `docs/SPEC.md`, the conflict must be reported
and resolved explicitly.

Agents must not silently choose between conflicting requirements.

---

# 2. Architectural Summary

docnoti is a:

> Local-first modular monolith with background processing and adapter-based
> external integrations.

The application is designed primarily for a single Windows computer.

The system does not require a remote docnoti server.

The architecture consists of:

```text
                    docnoti
                       |
          +------------+------------+
          |                         |
          v                         v
     Application UI          Background Worker
          |                         |
          +------------+------------+
                       |
                Application Layer
                       |
        +--------------+--------------+
        |              |              |
        v              v              v
   Documents        Tasks         Calendar
        |              |              |
        v              v              v
   Processing      Scheduling    Calendar Adapter
        |
   +----+----+
   |         |
   v         v
 Parser     OCR
   |
   v
Document Understanding
   |
   +----------+----------+
   |          |          |
   v          v          v
Summary   Information   Tasks
              |
              v
           Evidence
              |
              v
          AI Provider
          /         \
         /           \
   Local AI       Cloud AI