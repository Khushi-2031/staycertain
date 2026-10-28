// The 10 reference bookings (held out from training) with the probability Orange produced.
export const EXAMPLES = [
  {
    "id": 1,
    "inputs": {
      "lead_time": 3,
      "arrival_date_month": "April",
      "stays_in_weekend_nights": 1,
      "stays_in_week_nights": 1,
      "adults": 1,
      "children": 0,
      "meal": "BB",
      "market_segment": "Direct",
      "is_repeated_guest": "1",
      "previous_cancellations": 0,
      "previous_bookings_not_canceled": 1,
      "customer_type": "Transient",
      "adr": 64.8
    },
    "expected": 0.033
  },
  {
    "id": 2,
    "inputs": {
      "lead_time": 30,
      "arrival_date_month": "May",
      "stays_in_weekend_nights": 0,
      "stays_in_week_nights": 1,
      "adults": 1,
      "children": 0,
      "meal": "BB",
      "market_segment": "Groups",
      "is_repeated_guest": "0",
      "previous_cancellations": 0,
      "previous_bookings_not_canceled": 0,
      "customer_type": "Transient-Party",
      "adr": 130.0
    },
    "expected": 0.147
  },
  {
    "id": 3,
    "inputs": {
      "lead_time": 178,
      "arrival_date_month": "August",
      "stays_in_weekend_nights": 0,
      "stays_in_week_nights": 3,
      "adults": 2,
      "children": 0,
      "meal": "BB",
      "market_segment": "Online TA",
      "is_repeated_guest": "0",
      "previous_cancellations": 0,
      "previous_bookings_not_canceled": 0,
      "customer_type": "Transient-Party",
      "adr": 94.62
    },
    "expected": 0.189
  },
  {
    "id": 4,
    "inputs": {
      "lead_time": 185,
      "arrival_date_month": "April",
      "stays_in_weekend_nights": 1,
      "stays_in_week_nights": 1,
      "adults": 2,
      "children": 0,
      "meal": "HB",
      "market_segment": "Groups",
      "is_repeated_guest": "0",
      "previous_cancellations": 0,
      "previous_bookings_not_canceled": 0,
      "customer_type": "Transient-Party",
      "adr": 85.0
    },
    "expected": 0.219
  },
  {
    "id": 5,
    "inputs": {
      "lead_time": 37,
      "arrival_date_month": "October",
      "stays_in_weekend_nights": 0,
      "stays_in_week_nights": 4,
      "adults": 3,
      "children": 1,
      "meal": "HB",
      "market_segment": "Online TA",
      "is_repeated_guest": "0",
      "previous_cancellations": 0,
      "previous_bookings_not_canceled": 0,
      "customer_type": "Transient",
      "adr": 183.0
    },
    "expected": 0.321
  },
  {
    "id": 6,
    "inputs": {
      "lead_time": 17,
      "arrival_date_month": "April",
      "stays_in_weekend_nights": 0,
      "stays_in_week_nights": 2,
      "adults": 2,
      "children": 0,
      "meal": "BB",
      "market_segment": "Online TA",
      "is_repeated_guest": "0",
      "previous_cancellations": 0,
      "previous_bookings_not_canceled": 0,
      "customer_type": "Transient",
      "adr": 142.0
    },
    "expected": 0.338
  },
  {
    "id": 7,
    "inputs": {
      "lead_time": 155,
      "arrival_date_month": "May",
      "stays_in_weekend_nights": 0,
      "stays_in_week_nights": 3,
      "adults": 2,
      "children": 0,
      "meal": "BB",
      "market_segment": "Online TA",
      "is_repeated_guest": "0",
      "previous_cancellations": 0,
      "previous_bookings_not_canceled": 0,
      "customer_type": "Transient",
      "adr": 123.33
    },
    "expected": 0.456
  },
  {
    "id": 8,
    "inputs": {
      "lead_time": 199,
      "arrival_date_month": "August",
      "stays_in_weekend_nights": 2,
      "stays_in_week_nights": 3,
      "adults": 2,
      "children": 0,
      "meal": "BB",
      "market_segment": "Online TA",
      "is_repeated_guest": "0",
      "previous_cancellations": 0,
      "previous_bookings_not_canceled": 0,
      "customer_type": "Transient",
      "adr": 123.2
    },
    "expected": 0.482
  },
  {
    "id": 9,
    "inputs": {
      "lead_time": 314,
      "arrival_date_month": "December",
      "stays_in_weekend_nights": 3,
      "stays_in_week_nights": 6,
      "adults": 2,
      "children": 0,
      "meal": "SC",
      "market_segment": "Online TA",
      "is_repeated_guest": "0",
      "previous_cancellations": 0,
      "previous_bookings_not_canceled": 0,
      "customer_type": "Transient",
      "adr": 68.66
    },
    "expected": 0.732
  },
  {
    "id": 10,
    "inputs": {
      "lead_time": 97,
      "arrival_date_month": "March",
      "stays_in_weekend_nights": 2,
      "stays_in_week_nights": 5,
      "adults": 1,
      "children": 0,
      "meal": "HB",
      "market_segment": "Groups",
      "is_repeated_guest": "0",
      "previous_cancellations": 1,
      "previous_bookings_not_canceled": 0,
      "customer_type": "Transient",
      "adr": 79.43
    },
    "expected": 0.83
  }
];
