function log(msg) {
  return; 
  dt = new Date();
  dtString = dt.toISOString();
  console.log(`${dtString} ${msg}`);
}

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

    const handler = (event) => {
      if (event.data.type === 'FROM_PAGE' && event.data.serverParameters) {
        resolve(event.data.serverParameters);
        window.removeEventListener('message', handler);
      }
    };

    window.addEventListener('message', handler);
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

    if (!data?.accounts?.length) break; // Stop if no more accounts

    allAccounts = allAccounts.concat(data.accounts);

    // Stop fetching if conditions are met
    if (data.accounts.length < take || data.accounts.some(account => !account.activities)) {
      break;
    }

    skip += take; // Move to the next page
  }

  return allAccounts;
}

// Function to process activities and build leaderboardOverall
function processActivities(accounts, leaderboardOverall) {
  accounts.forEach(account => {
    if (!account.activities) return;

    account.activities.forEach(activity => {
      if (['FoundIt', 'FoundLabCache'].includes(activity.activityType)) {
        const logDate = activity.logDateTime.split('T')[0];
        leaderboardOverall[logDate] = leaderboardOverall[logDate] || [];
        leaderboardOverall[logDate].push({
          gcCode: activity.activityType === 'FoundIt' ? activity.logObjectCode : '',
          username: account.username
        });
      }
    });
  });
}

// Function to generate the list of found caches
function generateFoundCachesList(username, leaderboardOverall, activityGroupDay) {
  const fragment = document.createDocumentFragment();

  leaderboardOverall[activityGroupDay]?.forEach(entry => {
    if (entry.gcCode && entry.username === username) {
      const pItem = document.createElement('p');
      const link = document.createElement('a');
      link.name = `fullFoundCacheList_${entry.gcCode}`;
      link.href = `https://coord.info/${entry.gcCode}`;
      link.className = 'full-found-cache-list-cache-name';
      link.textContent = entry.gcCode;
      pItem.appendChild(link);
      fragment.appendChild(pItem);
    }
  });

  return fragment;
}

// Function to fetch geocache names for a list of gcCodes
async function fetchGeocacheNames(gcCodes) {
  const apiUrl = 'https://www.geocaching.com/api/proxy/web/search/v2/typeahead?query=';
  const promises = gcCodes.map(async gcCode => {
    const response = await fetch(apiUrl + gcCode);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    return data[0]?.geocacheName || null;
  });

  const geocacheNames = await Promise.all(promises);
  geocacheNames.forEach((name, index) => {
    if (name) {
      document.querySelectorAll(`a[name=fullFoundCacheList_${gcCodes[index]}]`).forEach(link => {
        link.textContent = name;
      });
    }
  });
}

// Function to fetch geocache details for a list of gcCodes with retry logic
async function fetchGeocacheDetails(gcCodes, prCode) {
  const apiUrl = 'https://www.geocaching.com/api/live/v1/search/geocachepreview/';

  // Helper function to fetch data with retries
  const fetchWithRetry = async (url, retries = 2) => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return await response.json();
    } catch (error) {
      if (retries > 0) {
        console.warn(`Retrying fetch for ${url}, attempts left: ${retries}`);
        return fetchWithRetry(url, retries - 1); // Retry the request
      } else {
        throw error; // No more retries, propagate the error
      }
    }
  };

  // Use for...of to handle each gcCode individually
  for (const gcCode of gcCodes) {
    try {
      const geocacheDetail = await fetchWithRetry(apiUrl + gcCode);

      // Update the HTML for this gcCode immediately
      if (geocacheDetail) {
        const geocacheLinks = document.querySelectorAll(`a[name=fullFoundCacheList_${gcCode}]`);
        geocacheLinks.forEach(link => {
          const icon = createGeocacheIcon(geocacheDetail.geocacheType);
          const metaData = createGeocacheMetaData(geocacheDetail, prCode);
          const founderName = link.parentElement.parentElement.getAttribute('data-founder-name');
          const logContent = createGeocacheLogContent(geocacheDetail, founderName);
          link.insertAdjacentElement('beforebegin', icon);
          link.insertAdjacentElement('afterend', logContent.logContent);
          link.insertAdjacentElement('afterend', logContent.logToggleLink);
          link.insertAdjacentElement('afterend', metaData);          
        });
      }
    } catch (error) {
      console.error(`Error fetching details for gcCode ${gcCode}:`, error);
    }
  }
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

  if (geocacheDetail.owner.code === prCode) {
    const ownerIcon = document.createElement('img');
    ownerIcon.className = 'found-or-not';
    ownerIcon.src = 'https://www.geocaching.com/api/live/v1/public/assets/icons/geocache/types/owned.svg';
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
      solvedIcon.src = 'https://www.geocaching.com/api/live/v1/public/assets/icons/geocache/types/solved.svg';
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

// Function to fetch logbook of a geocache
async function fetchGeocacheLogs(gcCode, founderName) {
  const logsPageUrl = `https://www.geocaching.com/seek/geocache_logs.aspx?code=${gcCode}`;
  const logsPageResponse = await fetch(logsPageUrl);
  const logsPageHtml = await logsPageResponse.text();

  const userTokenMatch = logsPageHtml.match(/userToken\s*=\s*'([^']+)'/);
  if (!userTokenMatch || !userTokenMatch[1]) {
    throw new Error('Failed to extract userToken from page');
  }
  const userToken = userTokenMatch[1];

  let currentPage = 1;
  let totalPages = 1;

  while (currentPage <= totalPages) {
    const logbookUrl = `https://www.geocaching.com/seek/geocache.logbook?tkn=${userToken}&idx=${currentPage}&num=100&sp=false&sf=false&decrypt=false`;
    const logbookResponse = await fetch(logbookUrl);
    if (!logbookResponse.ok) {
      throw new Error(`Failed to fetch logbook page ${currentPage}: ${logbookResponse.status}`);
    }
    const logbookData = await logbookResponse.json();
    if (currentPage === 1) {
      totalPages = logbookData.pageInfo?.totalPages || 1;
    }
    const foundLog = logbookData.data?.find(log =>
      log.UserName === founderName && log.LogTypeID === 2
    );
    if (foundLog) {
      return logbookData;
    }
    currentPage++;
  }

  throw new Error(`No found log by ${founderName} in ${totalPages} pages`);
}

// Function to create geocache log content element
function createGeocacheLogContent(geocacheDetail, founderName) {
  const logToggleLink = document.createElement('a');
  logToggleLink.className = 'metadata-toggle';
  logToggleLink.href = '#';
  logToggleLink.textContent = '[Show Log]';
  const noFoundLogDefaultContent = 'Loading...';

  // to insert HTML safely
  const safeInsertHTML = (element, html) => {
    element.innerHTML = '';
    if (!html) return;
    
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      const nodes = doc.body.childNodes;
      while(nodes.length > 0) {
        element.appendChild(nodes[0]);
      }
    } catch (e) {
      console.warn('HTML parse error:', e);
      element.textContent = html;
    }
  };

  logToggleLink.onclick = async function(e) {
    e.preventDefault();
    const content = this.nextElementSibling;
    content.style.display = content.style.display === 'none' ? 'block' : 'none';
    this.textContent = content.style.display === 'none' ? '[Show Log]' : '[Hide]';
    if (content.textContent == noFoundLogDefaultContent) {
      try {
        const logBook = await fetchGeocacheLogs(geocacheDetail.code, founderName);
        const foundLog = logBook.data.find(
          log => log.UserName === founderName && log.LogTypeID === 2
        );
        
        if (foundLog) {
          safeInsertHTML(content, foundLog.LogText);
        } else {
          content.textContent = 'No found log in the log book of this cache.';
        }
      } catch (error) {
        console.error('Error loading logs:', error);
        content.textContent = 'Error loading log content';
      }
    }
  };

  const logContent = document.createElement('div');
  logContent.className = 'metadata-extra';
  logContent.style.display = 'none';
  const recentLog = geocacheDetail.recentActivities.find(
    act => act.owner.username === founderName && act.activityTypeId === 2
  );
  
  if (recentLog) {
    safeInsertHTML(logContent, recentLog.text);
  } else {
    logContent.textContent = noFoundLogDefaultContent;
  }

  return {logToggleLink: logToggleLink, logContent: logContent};
}

// Funtion to get the activity feed
function getActivityFeed() {
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      const activityFeed = document.querySelector('div#_ActivityFeed div#ActivityFeedComponent');
      if (activityFeed && activityFeed.querySelector('div.activity-block-header')) {
        clearInterval(interval);
        resolve(activityFeed);
      }
    }, 500);
  });
}

// Function to get the date of the nearest activity group
function getNearestDate() {
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      const header = document.querySelector('div#ActivityFeedComponent > div > div.activity-block-header h2');
      if (header) {
        clearInterval(interval);
        resolve(header.innerHTML.trim());
      }
    }, 500);
  });
}

// Main logic
async function main() {
  log('Main starts.');
  const serverParameters = await getServerParameters();

  if (serverParameters?.['user:info']?.referenceCode?.startsWith('PR')) {
    const prCode = serverParameters['user:info']['referenceCode'];
    const myself = serverParameters['user:info']['username'];
    log(`prCode: ${prCode}`);
    log(`myself: ${myself}`);

    const [currentWeekAccounts, previousWeekAccounts] = await Promise.all([
      fetchAllAccountsData(`https://www.geocaching.com/api/proxy/web/v1/leaderboard/1/account/${prCode}`),
      fetchAllAccountsData(`https://www.geocaching.com/api/proxy/web/v1/leaderboard/1/account/${prCode}/lastweek`)
    ]);

    if (currentWeekAccounts && previousWeekAccounts) {
      log('Got current week data and previous week data.');
      const leaderboardOverall = {};
      processActivities(currentWeekAccounts, leaderboardOverall);
      processActivities(previousWeekAccounts, leaderboardOverall);
      log('Merged current week data and previous week data.');

      const activityFeed = await getActivityFeed();
      log('Got activity feed.');
      const activityGroups = activityFeed.querySelectorAll('ol.activity-groups > li');

      if (activityGroups.length > 0) {
        log(`Got ${activityGroups.length} activity groups.`);
        const nearestDate = await getNearestDate();
        log(`Got nearest date: ${nearestDate}.`);

        activityGroups.forEach((group, i) => {
          const activityGroupDay = i > 0 ? group.querySelector('h2').innerHTML.trim() : nearestDate;
          const activities = group.querySelectorAll('ol.activity-group > li.activity-item');

          log(`Disposing with activity group of ${activityGroupDay}.`);
          activities.forEach(activity => {
            if (activity.getAttribute('data-logtypeid') === '2' && !activity.querySelector('h3 + div')) {
              let username = activity.querySelector('h3 a.font-bold').innerHTML.trim();
              username = username === 'You' ? myself : username;

              log(`Disposing with activities of ${username} on ${activityGroupDay}.`);
              const foundCachesList = generateFoundCachesList(username, leaderboardOverall, activityGroupDay);
              const activityDetails = activity.querySelector('div.activity-details');

              if (activityDetails.querySelector('details')) {
                log('<details> already exists, to rebuild it.');
                activityDetails.querySelector('details').remove();
              }
              const details = document.createElement('details');
              details.className = 'full-list-of-found-caches';
              details.setAttribute('data-founder-name', username);

              const summary = document.createElement('summary');
              summary.textContent = 'Full List of Found Caches';
              details.appendChild(summary);
              details.appendChild(foundCachesList);
              activityDetails.appendChild(details);
            }
          });
        });

        const gcCodes = new Set();
        Object.values(leaderboardOverall).forEach(entries => {
          entries.forEach(entry => {
            if (entry.gcCode) gcCodes.add(entry.gcCode);
          });
        });

        if (gcCodes.size > 0) {
          await fetchGeocacheNames([...gcCodes]);
          await fetchGeocacheDetails([...gcCodes], prCode);
        }
      } else {
        log('No activity groups.');
      }
    } else {
      log('Cannot get current week data or previous week data.')
    }
  } else {
    log('Cannot get the prCode.')
  }
  log('Main finishes.');
}

// Start the main logic
main();