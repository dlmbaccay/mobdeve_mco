import { View, ToastAndroid, Animated } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FAB, useTheme } from 'react-native-paper';
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import MapView, { Marker } from "react-native-maps";
import * as Location from "expo-location";
import auth from "@react-native-firebase/auth";
import firestore from "@react-native-firebase/firestore";
import SpinningWheel from "../components/spinningWheel";
import AddReport from "../components/addReport";
import ViewReport from "../components/viewReport";
import TopBar from "../components/topBar";
import { MarkerType, ReportType, LocationType, User } from "../types/interfaces";

const Home = () => {

  const theme = useTheme();
  
  // location and map states
  const [isLoading, setLoading] = useState(true);
  const [mapRef, setMapRef] = useState<MapView | null>(null);
  const [location, setLocation] = useState<LocationType | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<LocationType | null>(null);
  const [isNotCentered, setIsNotCentered] = useState(false);

  // animation states for AddReport component
  const [isAnimating, setIsAnimating] = useState(false);
  const slideAnimation = useRef(new Animated.Value(300)).current;

  // marker and report states
  const [markers, setMarkers] = useState<MarkerType[]>([]); 
  const [reports, setReports] = useState<ReportType[]>([]);
  
  // visibility states
  const [addReportVisible, setAddReportVisible] = useState(false);
  const [viewReportVisible, setViewReportVisible] = useState(false);

  const [user, setUser] = useState<User>({
    firstName: "",
    lastName: "",
    email: "",
    avatarUrl: "",
  });

  useEffect(() => { 
    const initializeLocationAndFetchMarkers = async () => {
      try {
        const userLocation = await getUserCurrentLocation();
        setLocation({
          latitude: userLocation.coords.latitude,
          longitude: userLocation.coords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });

        fetchMarkers(userLocation, 5); // fetch markers within 5km radius
      } catch (error) {
        console.error("Error fetching location:", error);
      }
    };

    // fetch user data from firestore
    const fetchUserData = async () => {
      if (auth().currentUser) {
        firestore().collection("users").doc(auth().currentUser?.uid).get()
        .then((doc) => {
          setUser({
            firstName: doc.data()?.firstName,
            lastName: doc.data()?.lastName,
            email: doc.data()?.email,
            avatarUrl: doc.data()?.avatarUrl,
          });
        })
        .catch((error) => {
          console.log(error);
        });
      }
    }

    initializeLocationAndFetchMarkers();
    fetchUserData();
  }, []);

  /**
   * getUserCurrentLocation
   * - Get user's current location
   * 
   * @returns user's current location
   */
  const getUserCurrentLocation = async (): Promise<Location.LocationObject> => {
    return await Location.getCurrentPositionAsync({ // get user's current location
      accuracy: Location.Accuracy.High,
    });
  };

  /**
   * fetchMarkers
   * - Fetch markers within a certain radius  
   * - Triggered as the user opens the app
   * - Fetches markers created within the last 24 hours
   * - Filters markers within the radius using haversine formula
   * - Stores filtered markers in state
   * 
   * @param userLocation - user's current location
   * @param radius - radius
   */
  const fetchMarkers = async (userLocation: Location.LocationObject, radius: number) => {
    try {
    const { latitude, longitude } = userLocation.coords;
      const dateNow = new Date();
      const twentyFourHoursAgo = new Date(dateNow.getTime() - 24 * 60 * 60 * 1000);

      const bounds = getBoundingBox(latitude, longitude, radius)

      // fetch markers created within the last 24 hours
      const snapshot = await firestore()
        .collection("markers")
        .where('latitude', '>=', bounds.minLat)
        .where('latitude', '<=', bounds.maxLat)
        .where('longitude', '>=', bounds.minLng)
        .where('longitude', '<=', bounds.maxLng) 
        .where("lastCreatedReportAt", ">=", twentyFourHoursAgo)
        .get();

      const fetchedMarkers = snapshot.docs.map(doc => ({
        markerId: doc.id,
        latitude: doc.data().latitude,
        longitude: doc.data().longitude,
        lastCreatedReportAt: doc.data().lastCreatedReportAt,
      }));

      // filter markers within the radius using haversine formula
      const filteredMarkers = fetchedMarkers.filter((marker) => {
        const distance = memoizedHaversine(
          userLocation.coords.latitude,
          userLocation.coords.longitude,
          marker.latitude,
          marker.longitude
        );
        return distance <= radius;
      });

      // store filtered markers in state
      setMarkers(filteredMarkers);
    } catch (error) {
      console.error("Error fetching markers:", error);
    } finally {
      setLoading(false);
    }
  };

  /** getBoundingBox
   * - Get bounding box for a given latitude, longitude, and radius
   * - Returns the minimum and maximum latitude and longitude
   * - Utilized to filter markers within a certain radius
   * 
   * @param latitude 
   * @param longitude 
   * @param radius 
   * @returns 
   */
  function getBoundingBox(latitude: number, longitude: number, radius: number) {
    const earthRadius = 6371;  // Radius of the earth in km
    const lat = latitude * (Math.PI / 180);
    const lon = longitude * (Math.PI / 180);
    const dLat = radius / earthRadius;
    const dLon = Math.asin(Math.sin(dLat) / Math.cos(lat));

    const minLat = lat - dLat;
    const maxLat = lat + dLat;
    const minLng = lon - dLon;
    const maxLng = lon + dLon;

    return {
      minLat: minLat * (180 / Math.PI),
      maxLat: maxLat * (180 / Math.PI),
      minLng: minLng * (180 / Math.PI),
      maxLng: maxLng * (180 / Math.PI),
    };
  }

  /**
   * memoizedHaversine
   * - Haversine formula to calculate distance between two points
   * - Memoized to cache results
   */
  const memoizedHaversine = (() => {
    const cache = new Map();
    
    return (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const key = `${lat1},${lon1}-${lat2},${lon2}`;
      if (cache.has(key)) return cache.get(key);

      const R = 6371; // Earth's radius in kilometers
      const dLat = (lat2 - lat1) * (Math.PI / 180);
      const dLon = (lon2 - lon1) * (Math.PI / 180);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) *
          Math.cos(lat2 * (Math.PI / 180)) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = R * c;

      cache.set(key, distance);
      return distance;
    };
  })();

  /**
   * handleRefetchMarkers
   * - Refetch markers within a 5km radius
   * - Calls fetchMarkers with the user's current location and a 5km radius
   */
  const handleRefetchMarkers = async () => {
    try {
      setLoading(true);
      const userLocation = await getUserCurrentLocation();
      fetchMarkers(userLocation, 5);
    } catch (error) {
      console.error("Error refetching markers:", error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * handleRegionChange 
   * - Handle region change when user pans the map
   * - Triggered by the user panning the map
   * - Check if the region is centered
   * - Set isNotCentered state accordingly
   * - Utilized to control the recenter FAB icon
   * 
   * @param region - region
   */
  const handleRegionChange = (region: any) => {
    if (location) {
      const isCentered =
        Math.abs(region.latitude - location.latitude) < 0.0001 &&
        Math.abs(region.longitude - location.longitude) < 0.0001;

      setIsNotCentered(!isCentered);
    }
  };

  /**
   * recenterMap
   * - Recenter the map to the user's current location
   * - Animate the map to the user's current location
   * - Set isNotCentered state to false
   * - Utilized to recenter the map when the recenter FAB is pressed
   * 
   * - Can also be used to recenter location to chosen location of the user (utilized in handlePlaceSelected)
   */
  const recenterMap = async (customLocation: LocationType | null = null) => {
    try {
      const targetLocation = customLocation || location; // Use customLocation if provided, otherwise default to user's location

      if (mapRef && targetLocation && !isAnimating) {
        setIsAnimating(true);

        // Fetch markers within 5km radius
        await fetchMarkers(
          {
            coords: {
              latitude: targetLocation.latitude,
              longitude: targetLocation.longitude,
              altitude: 0,
              accuracy: 0,
              altitudeAccuracy: null,
              heading: 0,
              speed: 0,
            },
            timestamp: Date.now(),
          },
          5 // 5km radius
        );

        // Animate the map to the target location
        mapRef.animateToRegion(
          {
            ...targetLocation,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          },
          1000 // 1-second animation
        );

        setTimeout(() => {
          setIsNotCentered(false);
          setIsAnimating(false); // Reset after animation
        }, 1000);
      }
    } catch (error) {
      console.error("Error recentering map:", error);
    }
  };


  /**
   * handleAddReport
   * - Triggered by the user long-pressing the map
   * - Sets the selected location state
   * - Displays the AddReport component
   * 
   * @param e - event
   */
  const handleAddReport = (e: any) => {
    const { coordinate } = e.nativeEvent;
    const selectedLocation = { ...coordinate, latitudeDelta: 0.01, longitudeDelta: 0.01 };
    setSelectedLocation(selectedLocation);
    setAddReportVisible(true);
    Animated.timing(slideAnimation, { toValue: 0, duration: 150, useNativeDriver: true }).start();
  }

  /**
   * fetchMarkerReports
   * - Called by handleViewMarkerPress to fetch reports for a marker passed as an argument
   * - Fetches reports for a marker
   * - Only fetches reports created within the last 24 hours
   * - Stores fetched reports in state
   * 
   * @param markerId - marker ID
   */
  const fetchMarkerReports = async (markerId: string) => {
    try {
      const dateNow = new Date();
      const twentyFourHoursAgo = new Date(dateNow.getTime() - 24 * 60 * 60 * 1000);

      // fetch reports created within the last 24 hours for the marker
      const snapshot = await firestore()
        .collection("reports")
        .where("markerId", "==", markerId)
        .where("createdAt", ">=", twentyFourHoursAgo)
        .get();

      const fetchedReports = snapshot.docs.map(doc => ({
        markerId: doc.data().markerId,
        reportId: doc.id,
        title: doc.data().title,
        description: doc.data().description,
        latitude: doc.data().latitude,
        longitude: doc.data().longitude,
        createdAt: doc.data().createdAt,
        userId: doc.data().userId,
        firstName: doc.data().firstName,
        lastName: doc.data().lastName,
        imageUrl: doc.data().imageUrl,
      }));

      setReports(fetchedReports);
    } catch (error) {
      console.error("Error fetching reports: ", error);
    }
  }

  /**
   * handleViewMarkerPress
   * - Triggered by the user pressing a marker
   * - Calls fetchMarkerReports to fetch reports for the marker
   * - Displays the ViewReport component
   * - Passes the fetched reports to the ViewReport component
   *
   * @param markerId - marker ID
   */
  const handleViewMarkerPress = async (markerId: string) => {
    await fetchMarkerReports(markerId);
    setViewReportVisible(true);
  }

  /** handlePlaceSelected
   * - Handle place selection from the Google Places Autocomplete component
   * - Fetch markers within a 5km radius of the selected location
   * - Recenter the map to the selected location
   * 
   * @param location - selected location from the Google Places Autocomplete component in topBar.tsx
   */
  const handlePlaceSelected = async (location: { lat: number; lng: number }) => {
    try {
      const selectedLocation = {
        coords: {
          latitude: location.lat,
          longitude: location.lng,
          altitude: 0,
          accuracy: 0,
          altitudeAccuracy: null,
          heading: 0,
          speed: 0,
        },
        timestamp: Date.now(), // Add a timestamp field to match the LocationObject type
      };

      // Fetch markers within 5km radius of the searched location
      await fetchMarkers(selectedLocation, 5);

      // Recenter the map to the selected location
      recenterMap({
        latitude: location.lat,
        longitude: location.lng,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
    } catch (error) {
      console.error("Error handling place selection:", error);
    }
  };

  /**
   * handleSignOut
   * - Sign out the user
   * - Triggered by the user pressing the sign out FAB
   * - Displays a toast message
   * - Redirects the user to the sign-in page
   * 
   */
  const handleSignOut = () => {
    try {
      auth().signOut().then(() => {
        ToastAndroid.show("Come back soon!", ToastAndroid.SHORT);
        router.push("sign-in");
      });
    } catch (error) {
      console.error("Error signing out: ", error);
    }
  } 

  return (
    <SafeAreaView className="h-full w-full" style={{ backgroundColor: theme.colors.background }}>
      <View className="w-full h-full flex items-center justify-center">
        {isLoading ? (  
          <SpinningWheel />
        ) : (
          <>
            { location && user && ( 
              <>
                <MapView
                  ref={(map) => setMapRef(map)}
                  className="w-full h-full"
                  initialRegion={location} 
                  showsMyLocationButton={false}
                  onRegionChangeComplete={(region) => handleRegionChange(region)}
                  showsUserLocation={true}
                  provider="google"
                  onLongPress={(e) => {
                    handleAddReport(e);
                  }}
                >
                  {markers?.map((marker) => (
                    <Marker
                      key={marker.markerId}
                      coordinate={{
                        latitude: marker.latitude,
                        longitude: marker.longitude,
                      }}
                      onPress={() => handleViewMarkerPress(marker.markerId)}
                    />
                  ))}
                </MapView>

                <TopBar 
                  user={user} 
                  handlePlaceSelected={handlePlaceSelected} 
                  handleSignOut={handleSignOut} 
                />

                <FAB
                  icon="refresh"
                  onPress={handleRefetchMarkers}
                  style={{ position: 'absolute', margin: 16, right: 5, bottom: 75, backgroundColor: theme.colors.primaryContainer }}
                />

                <FAB
                  icon={`${isNotCentered ? 'navigation-variant-outline' : 'navigation-variant'}`}
                  onPress={() => recenterMap(location)}
                  style={{ position: 'absolute', margin: 16, right: 5, bottom: 5, backgroundColor: theme.colors.primaryContainer }}
                />

                {addReportVisible && selectedLocation && (
                  <AddReport
                    reportVisible={addReportVisible}
                    hideReport={() => { 
                      Animated.timing(slideAnimation, { toValue: 300, duration: 150, useNativeDriver: true })
                      .start(() => setAddReportVisible(false));
                    }}
                    slideAnimation={slideAnimation}
                    latitude={selectedLocation.latitude}
                    longitude={selectedLocation.longitude}
                    setMarkers={setMarkers}
                    isNewMarker={true}
                  />
                )}

                {viewReportVisible && (
                  <ViewReport
                    reportVisible={viewReportVisible}
                    hideViewReport={() => setViewReportVisible(false)}
                    reportsData={reports}
                    setMarkers={setMarkers}
                  />
                )}
              </>
            )}
          </>
        )}
      </View>
    </SafeAreaView>
  );
};

export default Home;