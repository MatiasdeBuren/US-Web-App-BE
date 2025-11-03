import express from 'express';
import { requireAuth } from '../auth_middleware';
import { 
    createRating, 
    getAmenityRatings, 
    getAllRatings, 
    getUserRatings, 
    checkCanRate 
} from '../controllers/ratingController';

const router = express.Router();

router.post('/ratings', requireAuth, createRating);
router.get('/ratings/amenity/:amenityId', getAmenityRatings);
router.get('/ratings/my-ratings', requireAuth, getUserRatings);
router.get('/ratings/can-rate/:reservationId', requireAuth, checkCanRate);
router.get('/admin/ratings', requireAuth, getAllRatings);

export default router;
