// StayCertain - predict(inputs): cancellation probability at the time of booking.
// Logistic Regression trained in Orange 3.39 on 85,360 bookings (13 inputs, leakage removed), exported as a formula.
// The prediction comes ONLY from this formula - no AI service is used.

export const MODEL = {
  "intercept": -1.13551875242133,
  "numeric": {
    "lead_time": {
      "coef": 0.44244619842081234,
      "offset": 80.6028701968135,
      "factor": 0.011644386300050363
    },
    "stays_in_weekend_nights": {
      "coef": 0.02435405591009353,
      "offset": 1.0171274601686973,
      "factor": 0.974179054131177
    },
    "stays_in_week_nights": {
      "coef": 0.09331727721889323,
      "offset": 2.652893626991565,
      "factor": 0.49196054032515785
    },
    "adults": {
      "coef": -0.028958244987841962,
      "offset": 1.886082474226804,
      "factor": 2.0268544022502315
    },
    "children": {
      "coef": 0.0067530158067291,
      "offset": 0.14611059044048735,
      "factor": 2.15259460623797
    },
    "previous_cancellations": {
      "coef": 0.7503855209364455,
      "offset": 0.029006560449859418,
      "factor": 2.7377894548742825
    },
    "previous_bookings_not_canceled": {
      "coef": -0.6832072807263146,
      "offset": 0.16914245548266166,
      "factor": 0.5960453548455211
    },
    "adr": {
      "coef": 0.2656897996102164,
      "offset": 108.56757040767938,
      "factor": 0.019907172493111597
    }
  },
  "categorical": {
    "arrival_date_month": {
      "April": {
        "coef": 0.05046414157071463,
        "offset": 0.09092080599812559,
        "factor": 3.478303729165253
      },
      "August": {
        "coef": -0.05168807128054262,
        "offset": 0.12962746016869728,
        "factor": 2.977137572893121
      },
      "December": {
        "coef": 0.0495852403749262,
        "offset": 0.05761480787253983,
        "factor": 4.291594838887592
      },
      "February": {
        "coef": 0.05026565610641133,
        "offset": 0.06955248359887535,
        "factor": 3.9309519771735917
      },
      "January": {
        "coef": 0.02809507817487898,
        "offset": 0.053350515463917524,
        "factor": 4.449754886941305
      },
      "July": {
        "coef": -0.05028038812703858,
        "offset": 0.11561621368322399,
        "factor": 3.1273050255763595
      },
      "June": {
        "coef": -0.012950206291896096,
        "offset": 0.08949156513589503,
        "factor": 3.5032163692510907
      },
      "March": {
        "coef": 0.032601711812411345,
        "offset": 0.08608247422680412,
        "factor": 3.5652429236144987
      },
      "May": {
        "coef": 0.0037156520504299426,
        "offset": 0.09597000937207123,
        "factor": 3.3950080806909373
      },
      "November": {
        "coef": -0.005362696892046715,
        "offset": 0.056677600749765696,
        "factor": 4.324781770372493
      },
      "October": {
        "coef": -0.02019657168960657,
        "offset": 0.07861996251171509,
        "factor": 3.715473639950236
      },
      "September": {
        "coef": -0.043611302763864095,
        "offset": 0.07647610121836926,
        "factor": 3.762816684845263
      }
    },
    "meal": {
      "BB": {
        "coef": -0.007484118927335022,
        "offset": 0.7775070290534208,
        "factor": 2.404305724300715
      },
      "FB": {
        "coef": 0.0038428735616141832,
        "offset": 0.004029990627928772,
        "factor": 15.7842827262439
      },
      "HB": {
        "coef": -0.06536634737207163,
        "offset": 0.10460402999062793,
        "factor": 3.2675197706928203
      },
      "SC": {
        "coef": 0.0720130567941238,
        "offset": 0.1138589503280225,
        "factor": 3.148219354198315
      }
    },
    "market_segment": {
      "Aviation": {
        "coef": 0.010731960790281872,
        "offset": 0.002600749765698219,
        "factor": 19.63433502912572
      },
      "Complementary": {
        "coef": -0.016190151964232413,
        "offset": 0.0007146204311152765,
        "factor": 37.42118353853083
      },
      "Corporate": {
        "coef": 0.03784756083458908,
        "offset": 0.04845360824742268,
        "factor": 4.6571685370412155
      },
      "Direct": {
        "coef": -0.19816038764163055,
        "offset": 0.13523898781630742,
        "factor": 2.924159067682025
      },
      "Groups": {
        "coef": 0.1260415093804985,
        "offset": 0.055260074976569824,
        "factor": 4.376612843581389
      },
      "Offline TA/TO": {
        "coef": -0.1886815004408865,
        "offset": 0.1595946579194002,
        "factor": 2.730526669507982
      },
      "Online TA": {
        "coef": 0.20361624122351948,
        "offset": 0.5981373008434864,
        "factor": 2.039673757353192
      }
    },
    "is_repeated_guest": {
      "0": {
        "coef": 0.07685957092428856,
        "offset": 0.9658036551077788,
        "factor": 5.502571993238144
      },
      "1": {
        "coef": -0.07685957092428945,
        "offset": 0.03419634489222118,
        "factor": 5.502571993238144
      }
    },
    "customer_type": {
      "Contract": {
        "coef": -0.06322099359622123,
        "offset": 0.03648078725398313,
        "factor": 5.333812067315403
      },
      "Group": {
        "coef": -0.035702384728618336,
        "offset": 0.005962980318650422,
        "factor": 12.988740277516044
      },
      "Transient": {
        "coef": 0.20291229039701594,
        "offset": 0.8255623242736645,
        "factor": 2.6351474534105566
      },
      "Transient-Party": {
        "coef": -0.18435328020550412,
        "offset": 0.13199390815370196,
        "factor": 2.954348128268754
      }
    }
  }
};

// Same cut-offs and actions everywhere in the app (cost-based, see Evidence Workbook tab 2).
export const CUTOFFS = { medium: 0.30, high: 0.55 };
export const ACTIONS = {
  Low: "No action needed - keep the booking as normal.",
  Medium: "Send a WhatsApp reconfirmation 7 days before arrival.",
  High: "Ask for a 50% advance and send a WhatsApp reconfirmation; call if there is no reply.",
};
export function tierOf(p) { return p < CUTOFFS.medium ? "Low" : p < CUTOFFS.high ? "Medium" : "High"; }

export function predict(inputs) {
  let z = MODEL.intercept;
  for (const [col, p] of Object.entries(MODEL.numeric)) z += p.coef * (Number(inputs[col]) - p.offset) * p.factor;
  for (const [col, cats] of Object.entries(MODEL.categorical)) {
    for (const [cat, p] of Object.entries(cats)) z += p.coef * ((String(inputs[col]) === cat ? 1 : 0) - p.offset) * p.factor;
  }
  const probability = Math.round((1 / (1 + Math.exp(-z))) * 1000) / 1000;
  const tier = tierOf(probability);
  return { probability, tier, action: ACTIONS[tier] };
}
