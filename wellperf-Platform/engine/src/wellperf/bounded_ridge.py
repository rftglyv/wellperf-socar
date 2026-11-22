"""Ridge regression with coefficient bounds (scipy lsq_linear), alpha chosen by leave-one-out CV.

Penalised columns are centred and scaled before solving (well-intercept columns are left
as-is and unpenalised); ridge is applied by appending sqrt(alpha)·I rows for the penalised
columns. Bounds are given in raw feature units.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from scipy.optimize import lsq_linear


@dataclass(frozen=True)
class BoundedRidge:
    columns: tuple[str, ...]
    scale: np.ndarray
    coef_: np.ndarray  # raw feature units
    intercept_: float
    alpha_: float

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        return X[list(self.columns)].to_numpy(float) @ self.coef_ + self.intercept_

    def coef(self, column: str) -> float:
        return float(self.coef_[self.columns.index(column)])


def _standardise(X: np.ndarray, penalised: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    std = X.std(axis=0)
    center = np.where(penalised, X.mean(axis=0), 0.0)
    return center, np.where(penalised & (std > 0), std, 1.0)


def _solve(Xs: np.ndarray, y: np.ndarray, penalised: np.ndarray, alpha: float,
           lower: np.ndarray, upper: np.ndarray) -> np.ndarray:
    ridge_rows = np.sqrt(alpha) * np.diag(penalised.astype(float))[penalised]
    A = np.vstack([Xs, ridge_rows])
    b = np.concatenate([y, np.zeros(len(ridge_rows))])
    return lsq_linear(A, b, bounds=(lower, upper), method="bvls").x


def _fit_scaled(X: np.ndarray, y: np.ndarray, penalised: np.ndarray, alpha: float,
                lower_raw: np.ndarray, upper_raw: np.ndarray) -> tuple[np.ndarray, float, np.ndarray]:
    """Return (raw coefficients, intercept, scale)."""
    center, scale = _standardise(X, penalised)
    coef_s = _solve((X - center) / scale, y, penalised, alpha, lower_raw * scale, upper_raw * scale)
    coef = coef_s / scale
    return coef, float(-center @ coef), scale


def loo_error(X: np.ndarray, y: np.ndarray, penalised: np.ndarray, alpha: float,
              lower: np.ndarray, upper: np.ndarray) -> float:
    """Root-mean-square leave-one-out error of y for one alpha."""
    errors = np.empty(len(y))
    for i in range(len(y)):
        keep = np.arange(len(y)) != i
        coef, intercept, _ = _fit_scaled(X[keep], y[keep], penalised, alpha, lower, upper)
        errors[i] = X[i] @ coef + intercept - y[i]
    return float(np.sqrt(np.mean(errors**2)))


def fit_bounded_ridge(X: pd.DataFrame, y: np.ndarray, penalised: np.ndarray, alphas: np.ndarray,
                      lower: np.ndarray, upper: np.ndarray) -> BoundedRidge:
    values = X.to_numpy(float)
    scores = [loo_error(values, y, penalised, a, lower, upper) for a in alphas]
    alpha = float(alphas[int(np.argmin(scores))])
    coef, intercept, scale = _fit_scaled(values, y, penalised, alpha, lower, upper)
    return BoundedRidge(columns=tuple(X.columns), scale=scale, coef_=coef, intercept_=intercept, alpha_=alpha)
