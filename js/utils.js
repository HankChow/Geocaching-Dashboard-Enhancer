function log(msg) {
  // return; 
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