// Checks predict() against the 10 reference outputs produced by Orange.
// Run: node test_predict.js
import { predict } from "./predict.js";

const CASES = [
  {
    "id": 1,
    "inputs": {
      "hotel": "Resort Hotel",
      "lead_time": 69,
      "arrival_date_month": "February",
      "stays_in_weekend_nights": 2,
      "stays_in_week_nights": 3,
      "adults": 1,
      "children": 0,
      "meal": "BB",
      "market_segment": "Online TA",
      "is_repeated_guest": "0",
      "previous_cancellations": 0,
      "previous_bookings_not_canceled": 0,
      "booking_changes": 0,
      "deposit_type": "No Deposit",
      "customer_type": "Transient-Party",
      "adr": 37.0,
      "required_car_parking_spaces": 0,
      "total_of_special_requests": 1
    },
    "expected": 0.171
  },
  {
    "id": 2,
    "inputs": {
      "hotel": "Resort Hotel",
      "lead_time": 13,
      "arrival_date_month": "March",
      "stays_in_weekend_nights": 0,
      "stays_in_week_nights": 0,
      "adults": 2,
      "children": 0,
      "meal": "BB",
      "market_segment": "Online TA",
      "is_repeated_guest": "0",
      "previous_cancellations": 0,
      "previous_bookings_not_canceled": 0,
      "booking_changes": 1,
      "deposit_type": "No Deposit",
      "customer_type": "Transient",
      "adr": 0.0,
      "required_car_parking_spaces": 0,
      "total_of_special_requests": 1
    },
    "expected": 0.119
  },
  {
    "id": 3,
    "inputs": {
      "hotel": "City Hotel",
      "lead_time": 46,
      "arrival_date_month": "January",
      "stays_in_weekend_nights": 2,
      "stays_in_week_nights": 1,
      "adults": 2,
      "children": 0,
      "meal": "BB",
      "market_segment": "Online TA",
      "is_repeated_guest": "0",
      "previous_cancellations": 0,
      "previous_bookings_not_canceled": 0,
      "booking_changes": 0,
      "deposit_type": "No Deposit",
      "customer_type": "Transient",
      "adr": 102.6,
      "required_car_parking_spaces": 0,
      "total_of_special_requests": 2
    },
    "expected": 0.191
  },
  {
    "id": 4,
    "inputs": {
      "hotel": "Resort Hotel",
      "lead_time": 19,
      "arrival_date_month": "August",
      "stays_in_weekend_nights": 4,
      "stays_in_week_nights": 6,
      "adults": 2,
      "children": 1,
      "meal": "FB",
      "market_segment": "Online TA",
      "is_repeated_guest": "0",
      "previous_cancellations": 0,
      "previous_bookings_not_canceled": 0,
      "booking_changes": 1,
      "deposit_type": "No Deposit",
      "customer_type": "Transient",
      "adr": 245.3,
      "required_car_parking_spaces": 0,
      "total_of_special_requests": 0
    },
    "expected": 0.667
  },
  {
    "id": 5,
    "inputs": {
      "hotel": "Resort Hotel",
      "lead_time": 160,
      "arrival_date_month": "October",
      "stays_in_weekend_nights": 2,
      "stays_in_week_nights": 4,
      "adults": 2,
      "children": 0,
      "meal": "BB",
      "market_segment": "Direct",
      "is_repeated_guest": "0",
      "previous_cancellations": 0,
      "previous_bookings_not_canceled": 0,
      "booking_changes": 0,
      "deposit_type": "No Deposit",
      "customer_type": "Transient",
      "adr": 46.98,
      "required_car_parking_spaces": 0,
      "total_of_special_requests": 1
    },
    "expected": 0.187
  },
  {
    "id": 6,
    "inputs": {
      "hotel": "City Hotel",
      "lead_time": 159,
      "arrival_date_month": "October",
      "stays_in_weekend_nights": 2,
      "stays_in_week_nights": 3,
      "adults": 2,
      "children": 1,
      "meal": "HB",
      "market_segment": "Online TA",
      "is_repeated_guest": "0",
      "previous_cancellations": 0,
      "previous_bookings_not_canceled": 0,
      "booking_changes": 0,
      "deposit_type": "No Deposit",
      "customer_type": "Transient",
      "adr": 143.55,
      "required_car_parking_spaces": 0,
      "total_of_special_requests": 1
    },
    "expected": 0.502
  },
  {
    "id": 7,
    "inputs": {
      "hotel": "City Hotel",
      "lead_time": 6,
      "arrival_date_month": "September",
      "stays_in_weekend_nights": 0,
      "stays_in_week_nights": 1,
      "adults": 1,
      "children": 0,
      "meal": "BB",
      "market_segment": "Offline TA/TO",
      "is_repeated_guest": "0",
      "previous_cancellations": 0,
      "previous_bookings_not_canceled": 0,
      "booking_changes": 0,
      "deposit_type": "No Deposit",
      "customer_type": "Transient",
      "adr": 0.0,
      "required_car_parking_spaces": 0,
      "total_of_special_requests": 1
    },
    "expected": 0.028
  },
  {
    "id": 8,
    "inputs": {
      "hotel": "City Hotel",
      "lead_time": 148,
      "arrival_date_month": "June",
      "stays_in_weekend_nights": 0,
      "stays_in_week_nights": 2,
      "adults": 2,
      "children": 0,
      "meal": "SC",
      "market_segment": "Online TA",
      "is_repeated_guest": "0",
      "previous_cancellations": 0,
      "previous_bookings_not_canceled": 0,
      "booking_changes": 0,
      "deposit_type": "No Deposit",
      "customer_type": "Transient",
      "adr": 116.1,
      "required_car_parking_spaces": 0,
      "total_of_special_requests": 0
    },
    "expected": 0.61
  },
  {
    "id": 9,
    "inputs": {
      "hotel": "Resort Hotel",
      "lead_time": 157,
      "arrival_date_month": "November",
      "stays_in_weekend_nights": 1,
      "stays_in_week_nights": 3,
      "adults": 2,
      "children": 0,
      "meal": "BB",
      "market_segment": "Online TA",
      "is_repeated_guest": "0",
      "previous_cancellations": 0,
      "previous_bookings_not_canceled": 0,
      "booking_changes": 0,
      "deposit_type": "No Deposit",
      "customer_type": "Transient",
      "adr": 32.4,
      "required_car_parking_spaces": 0,
      "total_of_special_requests": 0
    },
    "expected": 0.553
  },
  {
    "id": 10,
    "inputs": {
      "hotel": "City Hotel",
      "lead_time": 115,
      "arrival_date_month": "February",
      "stays_in_weekend_nights": 2,
      "stays_in_week_nights": 2,
      "adults": 1,
      "children": 0,
      "meal": "BB",
      "market_segment": "Offline TA/TO",
      "is_repeated_guest": "0",
      "previous_cancellations": 0,
      "previous_bookings_not_canceled": 0,
      "booking_changes": 1,
      "deposit_type": "No Deposit",
      "customer_type": "Transient-Party",
      "adr": 60.0,
      "required_car_parking_spaces": 0,
      "total_of_special_requests": 0
    },
    "expected": 0.072
  }
];

let pass = 0;
for (const c of CASES) {
  const got = predict(c.inputs).probability;
  const ok = got.toFixed(3) === c.expected.toFixed(3);
  if (ok) pass++;
  console.log(`Case ${c.id}: expected ${c.expected.toFixed(3)}  got ${got.toFixed(3)}  ${ok ? "MATCH" : "MISMATCH"}`);
}
console.log(`\n${pass} of ${CASES.length} match Orange.`);
process.exit(pass === CASES.length ? 0 : 1);
