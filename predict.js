// StayCertain - predict(inputs)
// Trained Logistic Regression (Orange 3.39), exported as a formula.
// The prediction comes ONLY from this formula - no AI service is used.

export const MODEL = {
  "intercept": -2.5961237760571767,
  "numeric": {
    "lead_time": {
      "coef": 0.4648380468560496,
      "offset": 79.97095716382316,
      "factor": 0.011619714205334695
    },
    "stays_in_weekend_nights": {
      "coef": 0.02703001530277176,
      "offset": 1.0045404512933407,
      "factor": 0.9733979505400026
    },
    "stays_in_week_nights": {
      "coef": 0.11788492568204516,
      "offset": 2.623956613465419,
      "factor": 0.4902326830310385
    },
    "adults": {
      "coef": 0.039967058305593904,
      "offset": 1.8793684645019262,
      "factor": 1.6083997609594993
    },
    "children": {
      "coef": 0.034982977874669724,
      "offset": 0.1497431663914878,
      "factor": 2.1179887863076092
    },
    "previous_cancellations": {
      "coef": 0.6845895652128645,
      "offset": 0.030407264722069345,
      "factor": 2.707299366696738
    },
    "previous_bookings_not_canceled": {
      "coef": -0.5106544715714185,
      "offset": 0.18406026417171162,
      "factor": 0.5769840142366042
    },
    "booking_changes": {
      "coef": -0.22633007305789643,
      "offset": 0.26847138139790866,
      "factor": 1.4071845045727045
    },
    "adr": {
      "coef": 0.31474153247001146,
      "offset": 106.46395466427616,
      "factor": 0.019276482081173954
    },
    "required_car_parking_spaces": {
      "coef": -5.061058643896006,
      "offset": 0.08431939093744267,
      "factor": 3.550158117439964
    },
    "total_of_special_requests": {
      "coef": -0.5550141144668478,
      "offset": 0.6989313887360118,
      "factor": 1.201828205056056
    }
  },
  "categorical": {
    "hotel": {
      "City Hotel": {
        "coef": -0.02485392054666744,
        "offset": 0.6107365620986975,
        "factor": 2.0509318664148575
      },
      "Resort Hotel": {
        "coef": 0.024853920546651524,
        "offset": 0.3892634379013025,
        "factor": 2.0509318664148575
      }
    },
    "arrival_date_month": {
      "April": {
        "coef": 0.02968278609872693,
        "offset": 0.09057971014492754,
        "factor": 3.4841931051024297
      },
      "August": {
        "coef": -0.05121851090669218,
        "offset": 0.1288639699137773,
        "factor": 2.9846352127759856
      },
      "December": {
        "coef": 0.06714125430605905,
        "offset": 0.05861309851403412,
        "factor": 4.257146386982245
      },
      "February": {
        "coef": 0.045358246846567876,
        "offset": 0.06972344523940562,
        "factor": 3.926490424945547
      },
      "January": {
        "coef": 0.034296146100543407,
        "offset": 0.05370574206567602,
        "factor": 4.4358467810092135
      },
      "July": {
        "coef": -0.05603900895400245,
        "offset": 0.11515088974500091,
        "factor": 3.1327933030224977
      },
      "June": {
        "coef": -0.029523077299697765,
        "offset": 0.08891717116125482,
        "factor": 3.5134052869066448
      },
      "March": {
        "coef": 0.01618480732896793,
        "offset": 0.08583287470188956,
        "factor": 3.5699355140045372
      },
      "May": {
        "coef": -0.006390392381412118,
        "offset": 0.09567051917079435,
        "factor": 3.399754757375845
      },
      "November": {
        "coef": 0.026245893880401862,
        "offset": 0.05700788846083287,
        "factor": 4.3129904100699346
      },
      "October": {
        "coef": -0.0040816728140792,
        "offset": 0.0793317739864245,
        "factor": 3.700196938612221
      },
      "September": {
        "coef": -0.02917258696262135,
        "offset": 0.07660291689598239,
        "factor": 3.759958896572516
      }
    },
    "meal": {
      "BB": {
        "coef": -0.011219457476244513,
        "offset": 0.7784810126582279,
        "factor": 2.4080777727913762
      },
      "FB": {
        "coef": 0.010571928141987362,
        "offset": 0.004116217207851771,
        "factor": 15.618759150772558
      },
      "HB": {
        "coef": -0.036321880040150696,
        "offset": 0.1040978719501009,
        "factor": 3.2745286170334005
      },
      "SC": {
        "coef": 0.04755875040154195,
        "offset": 0.11330489818381949,
        "factor": 3.1549211016667984
      }
    },
    "market_segment": {
      "Aviation": {
        "coef": 0.0059314463866960414,
        "offset": 0.0025912676573105853,
        "factor": 19.67013224216766
      },
      "Complementary": {
        "coef": 0.04093918384095628,
        "offset": 0.00793432397725188,
        "factor": 11.27132112319003
      },
      "Corporate": {
        "coef": -0.006229335861761545,
        "offset": 0.048156301596037426,
        "factor": 4.670792967215573
      },
      "Direct": {
        "coef": -0.12879059918901808,
        "offset": 0.13505549440469639,
        "factor": 2.9258344510771632
      },
      "Groups": {
        "coef": -0.06265452147556891,
        "offset": 0.05642313337002385,
        "factor": 4.3339386310734485
      },
      "Offline TA/TO": {
        "coef": -0.31121505686171885,
        "offset": 0.15882406897816914,
        "factor": 2.7358886778377967
      },
      "Online TA": {
        "coef": 0.3450201766335222,
        "offset": 0.5910154100165107,
        "factor": 2.03398209389766
      }
    },
    "is_repeated_guest": {
      "0": {
        "coef": 0.07372617292767487,
        "offset": 0.9614405613648872,
        "factor": 5.193658961731053
      },
      "1": {
        "coef": -0.07372617292767353,
        "offset": 0.038559438635112825,
        "factor": 5.193658961731053
      }
    },
    "deposit_type": {
      "No Deposit": {
        "coef": -0.2016399927897389,
        "offset": 0.986883140708127,
        "factor": 8.78925784329276
      },
      "Non Refund": {
        "coef": 0.22642590044230118,
        "offset": 0.011890020179783526,
        "factor": 9.225843033058352
      },
      "Refundable": {
        "coef": -0.04573461799696361,
        "offset": 0.001226839112089525,
        "factor": 28.567534581830294
      }
    },
    "customer_type": {
      "Contract": {
        "coef": -0.061748418313042265,
        "offset": 0.03594523940561365,
        "factor": 5.371906660448484
      },
      "Group": {
        "coef": -0.028697100543988326,
        "offset": 0.006202990277013392,
        "factor": 12.736514869606111
      },
      "Transient": {
        "coef": 0.139510840960675,
        "offset": 0.8238511282333517,
        "factor": 2.6250386167932054
      },
      "Transient-Party": {
        "coef": -0.11565544842075613,
        "offset": 0.1340006420840213,
        "factor": 2.935538464376003
      }
    }
  }
};

export function predict(inputs) {
  let z = MODEL.intercept;
  for (const [col, p] of Object.entries(MODEL.numeric)) {
    z += p.coef * (Number(inputs[col]) - p.offset) * p.factor;
  }
  for (const [col, cats] of Object.entries(MODEL.categorical)) {
    for (const [cat, p] of Object.entries(cats)) {
      const x = String(inputs[col]) === cat ? 1 : 0;
      z += p.coef * (x - p.offset) * p.factor;
    }
  }
  const probability = Math.round((1 / (1 + Math.exp(-z))) * 1000) / 1000;
  let tier, action;
  if (probability < 0.3) {
    tier = "Low";
    action = "No action needed: keep the booking as normal.";
  } else if (probability < 0.6) {
    tier = "Medium";
    action = "Send a reminder one week before arrival asking the guest to confirm.";
  } else {
    tier = "High";
    action = "Ask for a deposit, or phone to confirm, before arrival.";
  }
  return { probability, tier, action };
}
