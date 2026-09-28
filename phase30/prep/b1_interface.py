"""B1/B3 - deterministic cost-parameter interface.

Registry B1: entry friction = ONE documented cost figure, selected by
the frozen five-criterion rule, recorded BEFORE the run, then frozen.
No grid, no source shopping, no placeholder value at pre-registration.

This interface carries a B1 cost record and converts it to the single
friction value the runner would use. It refuses to produce a friction
value unless every registered selection criterion is satisfied - the
LIMITED/no-execution path is explicit, never implicit.

Registry B3: fixed adverse offset 2.0 pips on top of control friction
(total 3.5 pips), one value, no sweep. Constants mirrored from
``phase30.prep.constants``.

INERT: produces parameters; never runs a strategy.
"""

from __future__ import annotations

from dataclasses import dataclass

B3_LATENCY_OFFSET_PIPS = 2.0
B3_TOTAL_FRICTION_PIPS = 3.5
CONTROL_FRICTION_PIPS = 1.5


@dataclass
class B1CostRecord:
    """Documented B1 cost source (registry five-criterion rule)."""

    provider: str | None = None              # criterion 1: figure published
    spread_or_total_identified: bool | None = None  # criterion 2
    source_page: str | None = None           # criterion 3: dated, accessible
    access_date: str | None = None
    convertible_to_pips: bool | None = None  # criterion 4
    spread_pips: float | None = None
    commission_pips: float | None = None
    single_figure_no_selection: bool | None = None  # criterion 5

    def failed_criteria(self) -> list[str]:
        """Names of the registered criteria not yet satisfied."""
        missing: list[str] = []
        if not self.provider:
            missing.append("criterion_1_figure_published")
        if self.spread_or_total_identified is not True:
            missing.append("criterion_2_spread_or_total_identified")
        if not self.source_page or not self.access_date:
            missing.append("criterion_3_dated_accessible_source")
        if self.convertible_to_pips is not True:
            missing.append("criterion_4_convertible_to_pips")
        if self.single_figure_no_selection is not True:
            missing.append("criterion_5_no_competing_figure_selection")
        return missing

    def friction_pips(self) -> float:
        """The single frozen B1 friction value.

        Raises unless ALL five criteria are satisfied and the pip
        components are present - per registry, B1 is LIMITED and NOT
        executed when no source qualifies; no placeholder is invented.
        """
        failed = self.failed_criteria()
        if failed:
            raise ValueError(
                "B1 selection rule not satisfied; B1 is LIMITED and must "
                f"not execute. Failed: {failed}"
            )
        if self.spread_pips is None or self.commission_pips is None:
            raise ValueError(
                "spread/commission pip components missing; cannot convert "
                "to a single friction value"
            )
        if self.spread_pips < 0 or self.commission_pips < 0:
            raise ValueError("negative cost components are not a valid cost figure")
        return float(self.spread_pips) + float(self.commission_pips)

    def to_dict(self) -> dict:
        return {
            "provider": self.provider,
            "spread_or_total_identified": self.spread_or_total_identified,
            "source_page": self.source_page,
            "access_date": self.access_date,
            "convertible_to_pips": self.convertible_to_pips,
            "spread_pips": self.spread_pips,
            "commission_pips": self.commission_pips,
            "single_figure_no_selection": self.single_figure_no_selection,
            "failed_criteria": self.failed_criteria(),
            "friction_pips": (
                self.spread_pips + self.commission_pips
                if self.spread_pips is not None and self.commission_pips is not None
                else None
            ),
        }
