async function loadRecentNearbyActivities() {
  log('loadRecentNearbyActivities starts.');
  const serverParameters = await getServerParameters();

  if (serverParameters?.['user:info']?.referenceCode?.startsWith('PR')) {
    const prCode = serverParameters['user:info']['referenceCode'];
    const myself = serverParameters['user:info']['username'];
    log(`prCode: ${prCode}`);
    log(`myself: ${myself}`);

    if (serverParameters?.['user:info']?.homeLocation) {
      const homeLocation = serverParameters['user:info'].homeLocation;
      const ns = homeLocation.Latitude > 0 ? 'N' : 'S';
      const ew = homeLocation.Longitude > 0 ? 'E' : 'W';
      const intLat = Math.trunc(homeLocation.Latitude);
      const minLat = ((Math.abs(homeLocation.Latitude) - Math.abs(intLat)) * 60).toFixed(3);
      const intLng = Math.trunc(homeLocation.Longitude);
      const minLng = ((Math.abs(homeLocation.Longitude) - Math.abs(intLng)) * 60).toFixed(3);

      const searchUrl = `https://www.geocaching.com/play/results?st=${ns}+${String(intLat).padStart(2, '0')}%C2%B0+${minLat}%27+${ew}+${String(intLng).padStart(2, '0')}%C2%B0+${minLng}%27&lat=${homeLocation.Latitude}&lng=${homeLocation.Longitude}&ot=coords&r=16`
      const searchResult = await getSearchData(searchUrl);
      searchResult.sort((a, b) => b.lastFoundDate.localeCompare(a.lastFoundDate));
      log(JSON.stringify(searchResult[0]));
    } else {
      log('Cannot get the homeLocation.');
    }
  } else {
    log('Cannot get the prCode.');
  }
  log('loadRecentNearbyActivities finishes.');
}
  
loadRecentNearbyActivities();