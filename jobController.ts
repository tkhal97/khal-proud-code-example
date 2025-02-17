// Other functions above that complete jobController.ts ...

/**
 * calculates the distance between two coordinate points using the haversine formula
 * @param coord1 [longitude, latitude]
 * @param coord2 [longitude, latitude]
 * @returns distance in miles
 */
function calculateDistance(
    coord1: [number, number],
    coord2: [number, number]
  ): number {
    const [lon1, lat1] = coord1;
    const [lon2, lat2] = coord2;
  
    const R = 3959; // Earth's radius in miles
    const lat1Rad = (lat1 * Math.PI) / 180;
    const lat2Rad = (lat2 * Math.PI) / 180;
    const deltaLat = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLon = ((lon2 - lon1) * Math.PI) / 180;
  
    const a =
      Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
      Math.cos(lat1Rad) *
        Math.cos(lat2Rad) *
        Math.sin(deltaLon / 2) *
        Math.sin(deltaLon / 2);
  
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
  

/* ########## OLD getJobsInRadiusFunction USING calculateDistance() ########## */
export const getJobsInRadius = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { latitude, longitude, radius = 50, includeAll = "true" } = req.query;
  
      if (!latitude || !longitude) {
        throw new JobError(400, "Latitude and longitude are required");
      }
  
      const lat = Number(latitude);
      const lng = Number(longitude);
      const rad = Number(radius);
  
      if (isNaN(lat) || isNaN(lng) || isNaN(rad)) {
        throw new JobError(400, "Invalid coordinate or radius values");
      }
  
      if (rad < 0 || rad > 100) {
        throw new JobError(400, "Radius must be between 0 and 100 miles");
      }
  
      // Build basic query without spatial conditions
      const query: any = {};
      if (includeAll !== "true") {
        query.status = "open";
      }
  
      // first get ALL jobs (this is the inefficient part)
      const allJobs = await Job.find(query)
        .populate({
          path: "bids",
          populate: {
            path: "contractorId",
            select: "_id firstName lastName",
          },
        })
        .lean();
  
      // Filter jobs by calculating distance for each one
      const nearbyJobs = allJobs.filter(job => {
        if (!job.location?.coordinates || 
            !Array.isArray(job.location.coordinates) || 
            job.location.coordinates.length !== 2) {
          return false;
        }
  
        const distance = calculateDistance(
          [lng, lat],
          job.location.coordinates as [number, number]
        );
  
        return distance <= rad;
      });
  
      res.json(nearbyJobs);
    } catch (error) {
      next(error);
    }
  };

/* ########## NEW getJobsInRadiusFunction USING MongoDBs $nearSphere (improved) ########## */
export const getJobsInRadius = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { latitude, longitude, radius = 50, includeAll = "true" } = req.query;
  
      if (!latitude || !longitude) {
        throw new JobError(400, "Latitude and longitude are required");
      }
  
      const lat = Number(latitude);
      const lng = Number(longitude);
      const rad = Number(radius);
  
      if (isNaN(lat) || isNaN(lng) || isNaN(rad)) {
        throw new JobError(400, "Invalid coordinate or radius values");
      }
  
      if (rad < 0 || rad > 100) {
        throw new JobError(400, "Radius must be between 0 and 100 miles");
      }
  
      // Build the query
      const query: any = {
        "location.coordinates": {
          $nearSphere: {
            $geometry: {
              type: "Point",
              coordinates: [lng, lat],
            },
            $maxDistance: rad * 1609.34, // convert miles to meters
          },
        },
      };
  
      // Only filter for open jobs if includeAll is false
      if (includeAll !== "true") {
        query.status = "open";
      }
  
      const nearbyJobs = await Job.find(query)
        .populate({
          path: "bids",
          populate: {
            path: "contractorId",
            select: "_id firstName lastName",
          },
        })
        .lean();
  
      res.json(nearbyJobs);
    } catch (error) {
      next(error);
    }
  };

  rubberduck