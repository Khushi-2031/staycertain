// Risk today: the model gives the probability of cancelling at the time of booking.
// As arrival gets closer without a cancellation, the risk falls. This curve (from 23,752 past cancellations)
// says what share of cancellations happen within the last d days before arrival, by lead-time group.
// Risk today = p*F / (1 - p*(1-F))  (Bayes' rule). Back-tested: at 30 days out, predicted 12% vs actual 14%.
export const TIMING = {"bins": [[0, 7], [8, 30], [31, 90], [91, 180], [181, 737]], "days": [0, 1, 2, 3, 5, 7, 10, 14, 21, 30, 45, 60, 90, 120, 150, 180, 240, 300, 365, 500, 737], "curve": [[0.4986, 0.6309, 0.7011, 0.812, 0.9256, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0], [0.0811, 0.1021, 0.1242, 0.1625, 0.2351, 0.3298, 0.4672, 0.6417, 0.8602, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0], [0.0442, 0.0551, 0.0651, 0.0799, 0.1075, 0.1335, 0.1736, 0.2301, 0.3166, 0.4384, 0.6728, 0.835, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0], [0.0339, 0.041, 0.0484, 0.0566, 0.0728, 0.0875, 0.1103, 0.1441, 0.1892, 0.2323, 0.3061, 0.3723, 0.5085, 0.7443, 0.909, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0], [0.021, 0.026, 0.0308, 0.039, 0.0511, 0.0611, 0.0748, 0.1014, 0.1329, 0.1708, 0.2215, 0.2614, 0.3405, 0.4131, 0.4879, 0.5791, 0.8268, 0.9389, 0.9853, 0.9983, 1.0]]};

export function shareWithin(lead, daysLeft) {
  const b = Math.max(0, TIMING.bins.findIndex(([lo, hi]) => lead >= lo && lead <= hi));
  const bin = lead > 737 ? TIMING.curve.length - 1 : b;
  const D = TIMING.days, C = TIMING.curve[bin];
  if (daysLeft <= D[0]) return C[0];
  for (let i = 1; i < D.length; i++) {
    if (daysLeft <= D[i]) return C[i - 1] + (C[i] - C[i - 1]) * (daysLeft - D[i - 1]) / (D[i] - D[i - 1]);
  }
  return 1;
}

export function riskToday(p, lead, daysLeft) {
  if (daysLeft >= lead) return p;               // just booked: nothing learned yet
  const F = shareWithin(lead, Math.max(0, daysLeft));
  return Math.round((p * F / (1 - p * (1 - F))) * 1000) / 1000;
}
