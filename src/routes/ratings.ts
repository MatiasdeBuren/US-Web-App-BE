import express from 'express';
import { requireAuth } from '../auth_middleware';
import { 
    createRating, 
    getAmenityRatings, 
    getAllRatings, 
    getUserRatings
} from '../controllers/ratingController';

const router = express.Router();

router.post('/ratings', requireAuth, createRating);
router.get('/ratings/amenity/:amenityId', getAmenityRatings);
router.get('/ratings/my-ratings', requireAuth, getUserRatings);
router.get('/admin/ratings', requireAuth, getAllRatings);

export default router;
