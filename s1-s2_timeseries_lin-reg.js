// ========================================================================================
// --------------------------- 0. DESCRIPTION  --------------------------------------------
// ========================================================================================
/*
This code conducts a time series analysis using Sentinel-2 optical and Sentinel-1.

The analysis focuses on a specific area of interest and a defined time period, set at the
beginning. The code loads and filter the Sentinel-2 and Sentinel-1 data based on the 
specified parameters. It then defines functions to enhance the image collections by adding 
optical vegetation indices and SAR polarimetric indices. The code includes functions for 
cloud masking and converting SAR data to the decibel scale.

After applying these functions to the image collections, the code generates time series
charts to visualize the temporal patterns of the selected optical vegetation indices and
SAR features. Additionally, a linear regression line is plotted to indicate the relative
change over time. These charts, together with the regression analysis, provide insights 
into the short-term fluctuations and long-term trends occurring within the area of interest 
throughout the specified time period.
*/


// ========================================================================================
// --------------------------- 1. INITIAL SETTINGS  ---------------------------------------
// ========================================================================================
// set start and end date
var startDate = '2019-04-01',
    endDate = '2022-04-01';

// select point/area for time series analysis
var selected = benlaw;

// set the maximum threshold for single image cloud coverage
var max_clouds = 50;

// define which optical and SAR feature we want to display
var listOfOpticalVIs = ['NDVI', 'EVI', 'NBR', 'NDMI'];
var listOfSARfeatures = ['VV','VH','RVI', 'RFDI'];

// Center map view to the selected point
Map.centerObject(selected,17);

// ========================================================================================
// --------------------------- 2. LOAD THE DATA  ------------------------------------------
// ========================================================================================
// Load Sentinel-1 data
var S1Collection = ee.ImageCollection('COPERNICUS/S1_GRD_FLOAT')
                  .filterBounds(selected)
                  .filterDate(startDate, endDate)
                  
                  // UNCOMMENT if you want to use only images from the same path and orbit 
                  // .filter(ee.Filter.eq('orbitProperties_pass','ASCENDING'))
                  // .filter(ee.Filter.lt('relativeOrbitNumber_start',146));

var S1 = ee.ImageCollection('COPERNICUS/S1_GRD_FLOAT')
                  .filterBounds(selected)
                  .filterDate(startDate, endDate)


// Check out the size of S1 image collection
print('S-1 collection size:', S1Collection.size());

// Load Sentinel-2 data
var S2 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
          .filterBounds(selected)
          .filterDate(startDate, endDate)
          .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE',max_clouds));

// Check out the size of our S2 image collection
print('S-2 collection size:', S2.size());

// ========================================================================================
// --------------------------- 3. DEFINE FUNCTIONS -----------------------------------------
// ========================================================================================

// Load the function to mask out clouds, their shadows and snow cover in Sentinel-2 images
// using the combination of 4 different cloud-shadow-snow masking approaches
var maskClouds = require('users/danielp/functions:maskClouds_S2');

// Function to add optical vegetation indices (VI)
var addOpticalVI = function(img) {
  var EVI = img.expression(
        '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))', {
            'NIR': img.select('B8').divide(10000),
            'RED': img.select('B4').divide(10000),
            'BLUE': img.select('B2').divide(10000)
        }).rename("EVI")
  
  var NDVI = img.normalizedDifference(['B8', 'B4']).rename('NDVI'), 
      // Normalized Difference Vegetation Index
      NDWI = img.normalizedDifference(['B3', 'B8']).rename('NDWI'), 
      // Normalized Difference Wetness Index
      NDMI = img.normalizedDifference(['B8', 'B11']).rename('NDMI'), 
      // Normalized Difference Moisture Index
      NBR = img.normalizedDifference(['B8', 'B12']).rename('NBR'); 
      // Normalized Burn Ratio
  
  return img
    .addBands([EVI, NDVI,NDWI, NDMI, NBR])
    .copyProperties(img,img.propertyNames());
};

// change linear units to dB
var powerToDb = function powerToDb (img){
  return ee.Image(10).multiply(img.log10()).copyProperties(img,img.propertyNames());
};

// Function to add SAR Polarimetric indices
var addSARIndices = function(img) {
  var VV = ee.Image(img.select('VV')),
      VH = ee.Image(img.select('VH'));
              
  var RVI = (ee.Image(4).multiply(VH))
            .divide(VV.add(VH)).rename('RVI'); // Radar Vegetation Index
  
  var RFDI = (VV.subtract(VH))
            .divide(VV.add(VH)).rename('RFDI'); // Radar Forest Degredation Index
  
  return img.select('angle')
            .addBands([ee.Image(powerToDb(VH)).rename('VH'), 
                      // Change linear to dB scale
                      ee.Image(powerToDb(VV)).rename('VV'),
                      // Change linear to dB scale
                      RVI, RFDI]);
};


// ========================================================================================
// --------------------------- 4. APPLY THE FUCTIONS --------------------------------------
// ========================================================================================

// Apply the function to mask out clouds, their shadows and snow cover in Sentinel-2 images
S2 = maskClouds.maskClouds(S2,startDate,endDate,selected,max_clouds);

// Add optical vegetation indices and select only the defined optical vegetation indices
S2 = S2.map(addOpticalVI).select(listOfOpticalVIs)

// Add SAR polarimetric indices, convert VV and VH to dB scale and select the SAR features
S1Collection = S1Collection.map(addSARIndices).select(listOfSARfeatures);

S1 = S1Collection.map(addSARIndices)

// Explore the S2 data
print(S2, 'S2 Image collection');

// Explore the S1 data
print(S1Collection, 'S1 Image collection');


// ========================================================================================
// --------------------------- 5. CREATE TIME SERIES CHARTS  ------------------------------
// ========================================================================================

// Explore Time series of SAR and optical data
// Create charts
var IndicesChartOriginal = ui.Chart.image.series({
    imageCollection: S2.select(listOfOpticalVIs),
    region: selected.buffer(50),
    reducer: ee.Reducer.mean(),
    scale: 20,
}).setOptions({
    title: 'Time-series of optical VI'
});

// display the TS chart in the Console
print('Time-series of optical VI', IndicesChartOriginal);


var VVVHChart = ui.Chart.image.series({
    imageCollection: S1Collection.select(['VV','VH']),
    region: selected.buffer(50),
    reducer: ee.Reducer.mean(),
    scale: 20,
}).setOptions({
    title: 'Time-series of SAR VV & VH',
    trendlines: {
     0: {color: 'CC0000'}
   }
});

// display the TS chart in the Console
print('Time-series of SAR VV & VH', VVVHChart);

var IndicesChartSAR = ui.Chart.image.series({
    imageCollection: S1Collection.select(['RVI']),
    region: selected.buffer(50),
    reducer: ee.Reducer.mean(),
    scale: 20,
}).setOptions({
    title: 'Time-series of SAR RVI',
   trendlines: {
     0: {color: 'CC0000'}
   }
});

// display the TS chart in the Console
print('Time-series of SAR RVI', IndicesChartSAR);

var IndicesChartSARX = ui.Chart.image.series({
    imageCollection: S1Collection.select(['RFDI']),
    region: selected.buffer(50),
    reducer: ee.Reducer.mean(),
    scale: 20,
}).setOptions({
    title: 'Time-series of SAR RFDI',
   trendlines: {
     0: {color: 'CC0000'}
   }
});

// display the TS chart in the Console
print('Time-series of SAR RFDI', IndicesChartSARX);

 
//----------------------------LINEAR REGRESSION----------------------------------- 

// Add a time band to the data.
var addTimeBand = function(image) {
  // Scale milliseconds by a large constant.
  return image.addBands(image.metadata('system:time_start').divide(1e18));
};   
    
// Fit a linear regression to the data.
var linearFit = S1.map(addTimeBand)
  .select(['system:time_start', 'RVI'])
  .reduce(ee.Reducer.linearFit());

// Compute predicted values for start and end dates.
var y0 = linearFit.select('scale').multiply(startDate).add(linearFit.select('offset'));
var y1 = linearFit.select('scale').multiply(endDate).add(linearFit.select('offset'));

// Compute the difference between the predicted values.
var diff = y1.subtract(y0);

// Visualize the result.
Map.addLayer(diff, {min: -0.2, max: 0.2, palette: ['red', 'white', 'green']}, 'Relative Change');
Map.centerObject(selected, 13);
