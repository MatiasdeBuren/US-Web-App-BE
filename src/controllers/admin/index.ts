// System Statistics
export { getSystemStats } from "./statsController";

// User Management
export { getAllUsers, updateUserRole } from "./usersController";

// Amenities Management
export { getAllAmenities } from "../amenitiesController";
export {
  createAmenity,
  updateAmenity,
  deleteAmenity,
  getAmenityDetailReservations
} from "./amenitiesController";

// Apartments Management
export { getAllApartments } from "../apartmentController";
export {
  createApartment,
  updateApartment,
  deleteApartment
} from "./apartmentsController";

// Reservations Management
export {
  getAllReservations,
  approveReservation,
  rejectReservation,
  getPendingReservations,
  cancelReservationAsAdmin
} from "./reservationsController";

// Claims Analytics
export {
  getClaimsMonthlyStats,
  getClaimsMetrics
} from "./claimsController";

// Expenses Management
export {
  getExpenses,
  getExpense,
  createExpense,
  updateExpense,
  deleteExpense,
  registerExpensePayment,
  deleteExpensePayment,
  getExpenseTypes,
  getExpenseStatuses,
  getPaymentMethods
} from "./expensesController";
