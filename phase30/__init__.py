"""Phase 30 — evidence-sufficiency assessment.

This package currently contains ONLY the inert preparation infrastructure
authorized by the G1–G4 protocol-resolution step (see
``VALDORA_PHASE30_PROTOCOL_RESOLUTION.md``). Nothing in this package
executes a Phase-30 research family:

- ``phase30.prep``  — eligibility/quality/state/provenance/registry
  infrastructure. Inert: importing it runs no research, touches no data,
  and performs no I/O beyond what a caller explicitly passes in.
- ``phase30.tests`` — unit tests for the preparation infrastructure,
  using synthetic fixtures only.

There is no ``phase30/data`` and no ``phase30/results`` yet. Both are
created only by authorized, registered Phase-30 execution.
"""
