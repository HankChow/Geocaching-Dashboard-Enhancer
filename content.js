// Function to inject script and get serverParameters from the page
function getServerParameters() {
  return new Promise((resolve) => {
    // Create a script element to inject into the page
    const script = document.createElement('script');
    script.textContent = `
      // Post a message with serverParameters to the content script
      window.postMessage({
        type: 'FROM_PAGE',
        serverParameters: window.serverParameters
      }, '*');
    `;
    // Append and immediately remove the script to execute it
    document.body.appendChild(script);
    document.body.removeChild(script);

    // Listen for the message containing serverParameters
    window.addEventListener('message', function handler(event) {
      if (event.data.type === 'FROM_PAGE' && event.data.serverParameters) {
        // Resolve the promise with serverParameters
        resolve(event.data.serverParameters);
        // Remove the event listener to avoid memory leaks
        window.removeEventListener('message', handler);
      }
    });
  });
}

// Function to fetch data from a given URL
async function fetchAPIData(url) {
  try {
    // Fetch data from the API
    const response = await fetch(url);
    // Throw an error if the response is not OK
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    // Parse and return the JSON response
    return await response.json();
  } catch (error) {
    // Log any errors that occur during the fetch
    console.error('Error fetching API data:', error);
    return null;
  }
}

// Function to fetch all accounts data with pagination
async function fetchAllAccountsData(baseUrl) {
  let allAccounts = [];
  let skip = 0;
  const take = 100;

  // Loop to fetch data in pages of 100 accounts
  while (true) {
    const url = `${baseUrl}?take=${take}&skip=${skip}`;
    const data = await fetchAPIData(url);

    // Stop if no more accounts are returned
    if (!data || !data.accounts || data.accounts.length === 0) {
      break;
    }

    // Concatenate the fetched accounts to the allAccounts array
    allAccounts = allAccounts.concat(data.accounts);

    // Check if we should stop fetching more data
    if (
      data.accounts.length < take || // Condition 1: Less than 100 accounts returned
      data.accounts.some(account => !account.activities) // Condition 2: Any account lacks activities
    ) {
      break;
    }

    // Increment skip to fetch the next page
    skip += take;
  }

  return allAccounts;
}

// Function to process activities and build leaderboardOverall
function processActivities(accounts, leaderboardOverall) {
  for (const account of accounts) {
    // Skip accounts without activities
    if (!account.activities) continue;

    // Process each activity in the account
    for (const activity of account.activities) {
      // Only process activities of type 'FoundIt' or 'FoundLabCache'
      if (['FoundIt', 'FoundLabCache'].includes(activity.activityType)) {
        const logDate = activity.logDateTime.split('T')[0]; // Extract the date from the timestamp
        // Initialize the array for the logDate if it doesn't exist
        if (!leaderboardOverall[logDate]) {
          leaderboardOverall[logDate] = [];
        }
        // Add the activity to the leaderboardOverall object
        leaderboardOverall[logDate].push({
          gcCode: activity.activityType === 'FoundIt' ? activity.logObjectCode : '', // Extract gcCode for 'FoundIt' activities
          username: account.username
        });
      }
    }
  }
}

// Function to generate the list of found caches
function generateFoundCachesList(username, leaderboardOverall, activityGroupDay) {
  const fragment = document.createDocumentFragment(); // Create a document fragment to hold the list items

  // Iterate through entries for the given day
  for (const entry of leaderboardOverall[activityGroupDay]) {
    // Only include entries with a valid gcCode and matching username
    if (entry.gcCode !== '' && entry.username === username) {
      const listItem = document.createElement('li'); // Create a list item
      const link = document.createElement('a'); // Create a link
      link.name = `fullFoundCacheList_${entry.gcCode}`; // Set the name attribute
      link.href = `https://coord.info/${entry.gcCode}`; // Set the href attribute
      link.textContent = entry.gcCode; // Set the link text
      listItem.appendChild(link); // Append the link to the list item
      fragment.appendChild(listItem); // Append the list item to the fragment
    }
  }

  return fragment; // Return the document fragment
}

// Function to fetch geocache names for a list of gcCodes
async function fetchGeocacheNames(gcCodes) {
  const apiUrl = 'https://www.geocaching.com/api/proxy/web/search/v2/typeahead?query=';
  // Create an array of promises to fetch geocache names
  const promises = gcCodes.map(async (gcCode) => {
    const response = await fetch(apiUrl + gcCode);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    // Return the geocache name from the first result, or null if not found
    return data[0]?.geocacheName || null;
  });

  // Wait for all promises to resolve
  const geocacheNames = await Promise.all(promises);
  // Update the textContent of each link with the corresponding geocache name
  geocacheNames.forEach((name, index) => {
    if (name) {
      const geocacheLinks = document.querySelectorAll(`a[name=fullFoundCacheList_${gcCodes[index]}]`);
      for (let i = 0; i < geocacheLinks.length; i++) {
        geocacheLinks[i].textContent = name; // Use textContent instead of innerHTML
      }
    }
  });
}


// Get the date of the nearest activity group (no <h2> tag)
function getNearestDate() {
  let headerWithNearestDate = null;
  
  // might myteriously not get the <h2> tag
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
  // Get serverParameters from the page
  const serverParameters = await getServerParameters();

  // Check if serverParameters['user:info']['referenceCode'] is in the form of PRxxxxx
  if (
    serverParameters &&
    serverParameters['user:info'] &&
    serverParameters['user:info']['referenceCode'] &&
    /^PR.+$/.test(serverParameters['user:info']['referenceCode'])
  ) {
    const prCode = serverParameters['user:info']['referenceCode'];
    const myself = serverParameters['user:info']['username'];

    // Define URLs for fetching leaderboard data
    const currentWeekLeaderBoardUrl = `https://www.geocaching.com/api/proxy/web/v1/leaderboard/1/account/${prCode}`;
    const previousWeekLeaderBoardUrl = `https://www.geocaching.com/api/proxy/web/v1/leaderboard/1/account/${prCode}/lastweek`;

    // Fetch all accounts data with pagination
    const [currentWeekAccounts, previousWeekAccounts] = await Promise.all([
      fetchAllAccountsData(currentWeekLeaderBoardUrl),
      fetchAllAccountsData(previousWeekLeaderBoardUrl)
    ]);

    if (currentWeekAccounts && previousWeekAccounts) {
      const leaderboardOverall = {};
      // Process activities for both current and previous weeks
      processActivities(currentWeekAccounts, leaderboardOverall);
      processActivities(previousWeekAccounts, leaderboardOverall);

      // Get all activity groups (each group represents a day)
      const activityGroups = document.querySelectorAll('ol.activity-groups > li');
      const nearestDate = getNearestDate();

      // Iterate through each activity group
      for (let i = 0; i < activityGroups.length; i++) {
        // The nearest day has no <h2>, so it needs to be handled separately
        const activityGroupDay = i > 0 ? activityGroups[i].querySelector('h2').innerHTML.trim() : nearestDate;
        const activities = activityGroups[i].querySelectorAll('ol.activity-group > li.activity-item');

        // Iterate through each activity in the group
        for (let j = 0; j < activities.length; j++) {
          if (activities[j].getAttribute('data-logtypeid') === '2') {  // logtypeid == 2 means found caches
            if (activities[j].querySelectorAll('h3 + div').length === 0) {  // no 'h3 + div' means a wrapped log
              let username = activities[j].querySelector('h3 a.font-bold').innerHTML.trim();
              username = (username === 'You' ? myself : username);

              // Generate the list of found caches for the user
              const foundCachesList = generateFoundCachesList(username, leaderboardOverall, activityGroupDay);
              const activityDetails = activities[j].querySelector('div.activity-details');

              // Add the list of found caches to the activity details if not already present
              if (activityDetails.querySelectorAll('details').length == 0) {
                const details = document.createElement('details'); // Create a details element
                details.className = 'full-list-of-found-caches'; // Set the class name

                const summary = document.createElement('summary'); // Create a summary element
                summary.textContent = 'Full List of Found Caches'; // Set the summary text
                details.appendChild(summary); // Append the summary to the details

                const ol = document.createElement('ol'); // Create an ordered list element
                ol.appendChild(foundCachesList); // Append the document fragment to the list
                details.appendChild(ol); // Append the list to the details

                activityDetails.appendChild(details); // Append the details to the activity details
              }
            }
          }
        }
      }

      // Extract and deduplicate gcCodes from leaderboardOverall
      const gcCodes = new Set();
      for (const day in leaderboardOverall) {
        leaderboardOverall[day].forEach(entry => {
          if (entry.gcCode) {
            gcCodes.add(entry.gcCode);
          }
        });
      }

      // Fetch and log geocache names for each gcCode
      if (gcCodes.size > 0) {
        await fetchGeocacheNames([...gcCodes]);
      }
    }
  }
}

// Start the main logic
main();