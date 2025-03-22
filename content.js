// Function to inject script and get serverParameters from the page
function getServerParameters() {
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.textContent = `
      window.postMessage({
        type: 'FROM_PAGE',
        serverParameters: window.serverParameters
      }, '*');
    `;
    document.body.appendChild(script);
    document.body.removeChild(script);

    window.addEventListener('message', function handler(event) {
      if (event.data.type === 'FROM_PAGE' && event.data.serverParameters) {
        resolve(event.data.serverParameters);
        window.removeEventListener('message', handler);
      }
    });
  });
}

// Function to fetch data from a given URL
async function fetchAPIData(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching API data:', error);
    return null;
  }
}

// Function to fetch all accounts data with pagination
async function fetchAllAccountsData(baseUrl) {
  let allAccounts = [];
  let skip = 0;
  const take = 100;

  while (true) {
    const url = `${baseUrl}?take=${take}&skip=${skip}`;
    const data = await fetchAPIData(url);

    if (!data || !data.accounts || data.accounts.length === 0) {
      break; // Stop if no more accounts
    }

    allAccounts = allAccounts.concat(data.accounts);

    // Check if we should stop fetching more data
    if (
      data.accounts.length < take || // Condition 1: Less than 100 accounts returned
      data.accounts.some(account => !account.activities) // Condition 2: Any account lacks activities
    ) {
      break;
    }

    skip += take; // Move to the next page
  }

  return allAccounts;
}

// Function to process activities and build leaderboardOverall
function processActivities(accounts, leaderboardOverall) {
  for (const account of accounts) {
    if (!account.activities) continue;

    for (const activity of account.activities) {
      if (['FoundIt', 'FoundLabCache'].includes(activity.activityType)) {
        const logDate = activity.logDateTime.split('T')[0];
        if (!leaderboardOverall[logDate]) {
          leaderboardOverall[logDate] = [];
        }
        leaderboardOverall[logDate].push({
          gcCode: activity.activityType === 'FoundIt' ? activity.logObjectCode : '',
          username: account.username
        });
      }
    }
  }
}

// Function to generate the list of found caches
function generateFoundCachesList(username, leaderboardOverall, activityGroupDay) {
  const fragment = document.createDocumentFragment();

  for (const entry of leaderboardOverall[activityGroupDay]) {
    if (entry.gcCode !== '' && entry.username === username) {
      const pItem = document.createElement('p');
      const link = document.createElement('a');
      link.name = `fullFoundCacheList_${entry.gcCode}`;
      link.href = `https://coord.info/${entry.gcCode}`;
      link.className = 'full-found-cache-list-cache-name';
      link.textContent = entry.gcCode;
      pItem.appendChild(link);
      fragment.appendChild(pItem);
    }
  }

  return fragment;
}

// Function to fetch geocache names for a list of gcCodes
async function fetchGeocacheNames(gcCodes) {
  const apiUrl = 'https://www.geocaching.com/api/proxy/web/search/v2/typeahead?query=';
  const promises = gcCodes.map(async (gcCode) => {
    const response = await fetch(apiUrl + gcCode);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    return data[0]?.geocacheName || null;
  });

  const geocacheNames = await Promise.all(promises);
  geocacheNames.forEach((name, index) => {
    if (name) {
      const geocacheLinks = document.querySelectorAll(`a[name=fullFoundCacheList_${gcCodes[index]}]`);
      for (let i = 0; i < geocacheLinks.length; i++) {
        geocacheLinks[i].textContent = name;
      }
    }
  });
}

// Function to fetch geocache details for a list of gcCodes
async function fetchGeocacheDetails(gcCodes, prCode) {
  const apiUrl = 'https://www.geocaching.com/api/live/v1/search/geocachepreview/';
  const promises = gcCodes.map(async (gcCode) => {
    const response = await fetch(apiUrl + gcCode);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
  });

  const geocacheDetails = await Promise.all(promises);
  geocacheDetails.forEach((geocacheDetail, index) => {
    if (geocacheDetail) {
      const geocacheLinks = document.querySelectorAll(`a[name=fullFoundCacheList_${gcCodes[index]}]`);
      for (let i = 0; i < geocacheLinks.length; i++) {
        const geocacheIcon = createGeocacheIcon(geocacheDetail.geocacheType);
        const geocacheMetaData = createGeocacheMetaData(geocacheDetail, prCode);

        geocacheLinks[i].insertAdjacentElement('beforebegin', geocacheIcon);
        geocacheLinks[i].insertAdjacentElement('afterend', geocacheMetaData);
      }
    }
  });
}

// Function to create a geocache icon element
function createGeocacheIcon(geocacheType) {
  const icon = document.createElement('img');
  icon.src = `https://www.geocaching.com/account/app/ui-icons/icons/cache-types/${geocacheType}.svg`;
  icon.className = 'cache-type';
  icon.height = 16;
  icon.width = 16;
  return icon;
}

// Function to create geocache metadata element
function createGeocacheMetaData(geocacheDetail, prCode) {
  const metaData = document.createElement('span');
  metaData.className = 'cache-metadata';

  const addMetaDataItem = (content) => {
    const item = document.createElement('span');
    item.className = 'cache-metadata-item';
    item.textContent = content;
    metaData.appendChild(item);
  };

  const geocacheOwnerItem = document.createElement('span');
  geocacheOwnerItem.className = 'cache-metadata-item';
  const geocacheOwner = document.createElement('a');
  geocacheOwner.href = `https://coord.info/${geocacheDetail.owner.code}`;
  geocacheOwner.textContent = geocacheDetail.owner.username;
  geocacheOwnerItem.textContent = 'by ';
  geocacheOwnerItem.appendChild(geocacheOwner);
  metaData.appendChild(geocacheOwnerItem);

  addMetaDataItem('|');
  addMetaDataItem(geocacheDetail.code);
  addMetaDataItem(`${geocacheDetail.difficulty}/${geocacheDetail.terrain}`);
  addMetaDataItem([null, 'Not Chosen', 'Micro', 'Regular', 'Large', 'Virtual', 'Other', null, 'Small'][geocacheDetail.containerType]);

  if (geocacheDetail.favoritePoints > 0) {
    const favoritePointIcon = document.createElement('img');
    favoritePointIcon.className = 'favorite-point';
    favoritePointIcon.src = 'https://www.geocaching.com/play/app/ui-icons/css/png/heart-filled.png';
    favoritePointIcon.height = 8;
    favoritePointIcon.width = 8;

    const favoritePointsItem = document.createElement('span');
    favoritePointsItem.className = 'cache-metadata-item';
    favoritePointsItem.textContent = geocacheDetail.favoritePoints;
    favoritePointsItem.appendChild(favoritePointIcon);
    metaData.appendChild(favoritePointsItem);
  }

  if (geocacheDetail.owner.code == prCode) {
    const ownerIcon = document.createElement('img');
    ownerIcon.className = 'found-or-not';
    ownerIcon.src = 'https://www.geocaching.com/api/live/v1/public/assets/icons/geocache/types/owned.svg'
    ownerIcon.height = 16;
    ownerIcon.width = 16;

    const ownerItem = document.createElement('span');
    ownerItem.className = 'cache-metadata-item';
    ownerItem.appendChild(ownerIcon);
    metaData.appendChild(ownerItem);
  } else {
    if (geocacheDetail.userFound || geocacheDetail.userDidNotFind) {
      const foundOrNotIcon = document.createElement('img');
      foundOrNotIcon.className = 'found-or-not';
      foundOrNotIcon.src = geocacheDetail.userDidNotFind && !geocacheDetail.userFound
        ? 'https://www.geocaching.com/api/live/v1/public/assets/icons/geocache/types/dnf.svg'
        : 'https://www.geocaching.com/api/live/v1/public/assets/icons/geocache/types/smiley.svg';
      foundOrNotIcon.height = 16;
      foundOrNotIcon.width = 16;

      const foundOrNotItem = document.createElement('span');
      foundOrNotItem.className = 'cache-metadata-item';
      foundOrNotItem.appendChild(foundOrNotIcon);
      metaData.appendChild(foundOrNotItem);
    }

    if (!geocacheDetail.userFound && geocacheDetail.userCorrectedCoordinates) {
      const solvedIcon = document.createElement('img');
      solvedIcon.className = 'found-or-not';
      solvedIcon.src = 'https://www.geocaching.com/api/live/v1/public/assets/icons/geocache/types/solved.svg'
      solvedIcon.height = 16;
      solvedIcon.width = 16;

      const solvedItem = document.createElement('span');
      solvedItem.className = 'cache-metadata-item';
      solvedItem.appendChild(solvedIcon);
      metaData.appendChild(solvedItem);
    }
  }

  return metaData;
}

// Function to get the date of the nearest activity group
function getNearestDate() {
  let headerWithNearestDate = null;

  while (true) {
    setTimeout(500);
    if (document.querySelectorAll('div#ActivityFeedComponent > div > div.activity-block-header h2').length > 0) {
      headerWithNearestDate = document.querySelector('div#ActivityFeedComponent > div > div.activity-block-header h2');
      break;
    }
  }

  return headerWithNearestDate.innerHTML.trim();
}

// Main logic
async function main() {
  const serverParameters = await getServerParameters();

  if (
    serverParameters &&
    serverParameters['user:info'] &&
    serverParameters['user:info']['referenceCode'] &&
    /^PR.+$/.test(serverParameters['user:info']['referenceCode'])
  ) {
    const prCode = serverParameters['user:info']['referenceCode'];
    const myself = serverParameters['user:info']['username'];

    const currentWeekLeaderBoardUrl = `https://www.geocaching.com/api/proxy/web/v1/leaderboard/1/account/${prCode}`;
    const previousWeekLeaderBoardUrl = `https://www.geocaching.com/api/proxy/web/v1/leaderboard/1/account/${prCode}/lastweek`;

    const [currentWeekAccounts, previousWeekAccounts] = await Promise.all([
      fetchAllAccountsData(currentWeekLeaderBoardUrl),
      fetchAllAccountsData(previousWeekLeaderBoardUrl)
    ]);

    if (currentWeekAccounts && previousWeekAccounts) {
      const leaderboardOverall = {};
      processActivities(currentWeekAccounts, leaderboardOverall);
      processActivities(previousWeekAccounts, leaderboardOverall);

      const activityGroups = document.querySelectorAll('ol.activity-groups > li');
      const nearestDate = getNearestDate();

      for (let i = 0; i < activityGroups.length; i++) {
        const activityGroupDay = i > 0 ? activityGroups[i].querySelector('h2').innerHTML.trim() : nearestDate;
        const activities = activityGroups[i].querySelectorAll('ol.activity-group > li.activity-item');

        for (let j = 0; j < activities.length; j++) {
          if (activities[j].getAttribute('data-logtypeid') === '2') {
            if (activities[j].querySelectorAll('h3 + div').length === 0) {
              let username = activities[j].querySelector('h3 a.font-bold').innerHTML.trim();
              username = (username === 'You' ? myself : username);

              const foundCachesList = generateFoundCachesList(username, leaderboardOverall, activityGroupDay);
              const activityDetails = activities[j].querySelector('div.activity-details');

              if (activityDetails.querySelectorAll('details').length == 0) {
                const details = document.createElement('details');
                details.className = 'full-list-of-found-caches';

                const summary = document.createElement('summary');
                summary.textContent = 'Full List of Found Caches';
                details.appendChild(summary);
                details.appendChild(foundCachesList);
                activityDetails.appendChild(details);
              }
            }
          }
        }
      }

      const gcCodes = new Set();
      for (const day in leaderboardOverall) {
        leaderboardOverall[day].forEach(entry => {
          if (entry.gcCode) {
            gcCodes.add(entry.gcCode);
          }
        });
      }

      if (gcCodes.size > 0) {
        await fetchGeocacheNames([...gcCodes]);
        await fetchGeocacheDetails([...gcCodes], prCode);
      }
    }
  }
}

// Start the main logic
main();