const google_places_key = process.env.GOOGLE_MAPS_KEY
if(!google_places_key){
  console.error('GOOGLE_MAPS_KEY is not set')
  return;
}

const axios = require('axios');
const fs = require('fs')
const parse = require('csv-parse')
var GeoJSON = require('geojson');

async function URLtoLatLng(url) {
  const pathSegments = new URL(url).pathname.split('/');
  while(pathSegments.length > 0){
    const seg = pathSegments.pop()
    if(seg.includes('data=')){
      str = seg.substr('data='.length)
    }
  }

  var parts = str.split('!').filter(function(s) { return s.length > 0; }),
    root = [],                      // Root elemet
    curr = root,                    // Current array element being appended to
    m_stack = [root,],              // Stack of "m" elements
    m_count = [parts.length,];      // Number of elements to put under each level

  for(const el of parts){
    var kind = el.substr(1, 1),
      value = el.substr(2);

    // Decrement all the m_counts
    for (var i = 0; i < m_count.length; i++) {
      m_count[i]--;
    }

    if (kind === 'm') {            // Add a new array to capture coming values
      var new_arr = [];
      m_count.push(value);
      curr.push(new_arr);
      m_stack.push(new_arr);
      curr = new_arr;
    }
    else {
      if (kind == 'b') {                                    // Assuming these are boolean
        curr.push(value == '1');
      }
      else if (kind == 'd' || kind == 'f') {                // Float or double
        curr.push(parseFloat(value));
      }
      else if (kind == 'i' || kind == 'u' || kind == 'e') { // Integer, unsigned or enum as int
        curr.push(parseInt(value));
      }
      else if(kind = 's' && value.match(/^0x[0-9a-f]{16}\:0x[0-9a-f]{16}$/)){ // coords
        const place = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
          params: {
            key: google_places_key,
            ftid: value
          }
        })
        return place.data
      }
      else {                                                // Store anything else as a string
        curr.push(value);
      }
    }

    // Pop off all the arrays that have their values already
    while (m_count[m_count.length - 1] === 0) {
      m_stack.pop();
      m_count.pop();
      curr = m_stack[m_stack.length - 1];
    }
  }
}

const processFile = async (file) => {
  const records = []
  const parser = fs.createReadStream(file)
    .pipe(parse({
      from_line: 1,
      columns: true,
    }));

  for await (const record of parser) {
    const data = await URLtoLatLng(record.URL)
    if(data.status === 'OK'){
      const result = data.result
      const location = result.geometry.location
      // remove too deep / big structures
      delete result.reviews
      delete result.photos
      delete result.opening_hours
      delete result.geometry
      records.push({...record, ...result, ...location})
    }
  }
  return records
}

(async () => {
  if(process.argv.length < 3){
    console.error(`Usage: node google-bookmarked-places-to-geojson.js <csv-file-path>`)
    return;
  }
  const records = await processFile(process.argv[2])
  const result = GeoJSON.parse(records, {Point: ['lat', 'lng']});
  console.log(JSON.stringify(result))
})()
