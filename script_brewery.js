// Create a JSON object
var breweryObject = [
    {"name":"Hill Farmstead Brewery","image_url":"https:\/\/assets.untappd.com\/site\/brewery_logos\/brewery-2562_e7536.jpeg","State":"VT","Country":"United States","Avg Beer Rating":4.4821428571,"Count":14,"Top Beer Rating":5.0,"Global Avg Rating":4.2935714286,"Diff":0.1885714286,"VORB":85.958296949},
    {"name":"Fidens Brewing Co","image_url":"https:\/\/assets.untappd.com\/site\/brewery_logos_hd\/brewery-426930_f396a_hd.jpeg","State":"NY","Country":"United States","Avg Beer Rating":4.4642857143,"Count":7,"Top Beer Rating":4.75,"Global Avg Rating":4.3985714286,"Diff":0.0657142857,"VORB":74.8968008256},
    {"name":"Tree House Brewing Company","image_url":"https:\/\/assets.untappd.com\/site\/brewery_logos\/brewery-treehousebrewingcompany_20084.jpeg","State":"MA","Country":"United States","Avg Beer Rating":4.3571428571,"Count":14,"Top Beer Rating":4.75,"Global Avg Rating":4.4107142857,"Diff":-0.0535714286,"VORB":69.0977880072},
    {"name":"Toppling Goliath Brewing Co.","image_url":"https:\/\/assets.untappd.com\/site\/brewery_logos_hd\/brewery-7532_a62d3_hd.jpeg","State":"IA","Country":"United States","Avg Beer Rating":4.3125,"Count":4,"Top Beer Rating":4.5,"Global Avg Rating":4.2725,"Diff":0.04,"VORB":54.4362745098},
    {"name":"River Roost Brewery ","image_url":"https:\/\/assets.untappd.com\/site\/brewery_logos\/brewery-250774_fd180.jpeg","State":"VT","Country":"United States","Avg Beer Rating":4.1111111111,"Count":9,"Top Beer Rating":4.75,"Global Avg Rating":4.1933333333,"Diff":-0.0822222222,"VORB":51.5716374269},
    {"name":"The Veil Brewing Co.","image_url":"https:\/\/assets.untappd.com\/site\/brewery_logos_hd\/brewery-245461_34650_hd.jpeg","State":"VA","Country":"United States","Avg Beer Rating":4.25,"Count":5,"Top Beer Rating":4.75,"Global Avg Rating":4.244,"Diff":0.006,"VORB":46.217849488},
    {"name":"von Trapp Brewing","image_url":"https:\/\/assets.untappd.com\/site\/brewery_logos\/brewery-4157_77366.jpeg","State":"VT","Country":"United States","Avg Beer Rating":4.25,"Count":3,"Top Beer Rating":4.5,"Global Avg Rating":3.6833333333,"Diff":0.5666666667,"VORB":43.6274509804},
    {"name":"BreWskey","image_url":"https:\/\/assets.untappd.com\/site\/brewery_logos_hd\/brewery-249696_c7097_hd.jpeg","State":"Quebec","Country":"Canada","Avg Beer Rating":4.0833333333,"Count":3,"Top Beer Rating":4.5,"Global Avg Rating":4.2866666667,"Diff":-0.2033333333,"VORB":41.4710182319},
    {"name":"Other Half Brewing Co.","image_url":"https:\/\/assets.untappd.com\/site\/brewery_logos_hd\/brewery-94785_ca64f_hd.jpeg","State":"NY","Country":"United States","Avg Beer Rating":4.0357142857,"Count":14,"Top Beer Rating":4.5,"Global Avg Rating":4.2228571429,"Diff":-0.1871428571,"VORB":41.3112745098},
    {"name":"Lawson's Finest Liquids","image_url":"https:\/\/assets.untappd.com\/site\/brewery_logos_hd\/brewery-3758_1926f_hd.jpeg","State":"VT","Country":"United States","Avg Beer Rating":4.05,"Count":5,"Top Beer Rating":4.5,"Global Avg Rating":4.008,"Diff":0.042,"VORB":37.9536463708},
    {"name":"Port City Brewing","image_url":"https:\/\/assets.untappd.com\/site\/brewery_logos\/brewery-7771_084be.jpeg","State":"VA","Country":"United States","Avg Beer Rating":3.8333333333,"Count":6,"Top Beer Rating":4.75,"Global Avg Rating":3.6883333333,"Diff":0.145,"VORB":30.8682126697},
    {"name":"Bluejacket","image_url":"https:\/\/assets.untappd.com\/site\/brewery_logos_hd\/brewery-35837_99aed_hd.jpeg","State":"DC","Country":"United States","Avg Beer Rating":3.8375,"Count":20,"Top Beer Rating":4.25,"Global Avg Rating":3.898,"Diff":-0.0605,"VORB":30.0687701175},
    {"name":"Founders Brewing Co.","image_url":"https:\/\/assets.untappd.com\/site\/brewery_logos_hd\/brewery-549_7db30_hd.jpeg","State":"MI","Country":"United States","Avg Beer Rating":4.0,"Count":3,"Top Beer Rating":4.5,"Global Avg Rating":4.0866666667,"Diff":-0.0866666667,"VORB":29.4172932331},
    {"name":"Cellarmaker Brewing Company","image_url":"https:\/\/assets.untappd.com\/site\/brewery_logos\/brewery-CellarmakerBrewingCompany_82753_d165c.jpeg","State":"CA","Country":"United States","Avg Beer Rating":4.0833333333,"Count":3,"Top Beer Rating":4.5,"Global Avg Rating":4.2066666667,"Diff":-0.1233333333,"VORB":28.809155241},
    {"name":"Bayerische Staatsbrauerei Weihenstephan","image_url":"https:\/\/assets.untappd.com\/site\/brewery_logos_hd\/brewery-88_7815c_hd.jpeg","State":"Bavaria","Country":"Germany","Avg Beer Rating":3.9,"Count":5,"Top Beer Rating":4.25,"Global Avg Rating":3.738,"Diff":0.162,"VORB":28.3041101056},
    {"name":"Trillium Brewing Company","image_url":"https:\/\/assets.untappd.com\/site\/brewery_logos_hd\/brewery-23038_d3f91_hd.jpeg","State":"MA","Country":"United States","Avg Beer Rating":4.0,"Count":10,"Top Beer Rating":4.5,"Global Avg Rating":4.193,"Diff":-0.193,"VORB":26.9170168067},
    {"name":"Schlenkerla (\"Heller-Bräu\" Trum)","image_url":"https:\/\/assets.untappd.com\/site\/brewery_logos\/brewery-2001_78248.jpeg","State":"Bavaria","Country":"Germany","Avg Beer Rating":4.3333333333,"Count":3,"Top Beer Rating":4.5,"Global Avg Rating":3.5966666667,"Diff":0.7366666667,"VORB":26.7857142857},
    {"name":"Wheatland Spring Farm + Brewery","image_url":"https:\/\/assets.untappd.com\/site\/brewery_logos_hd\/brewery-433200_0fc75_hd.jpeg","State":"VA","Country":"United States","Avg Beer Rating":3.85,"Count":5,"Top Beer Rating":4.25,"Global Avg Rating":3.972,"Diff":-0.122,"VORB":23.907378741},
    {"name":"Heliotrope Brewery","image_url":"https:\/\/assets.untappd.com\/site\/brewery_logos_hd\/brewery-451361_dac98_hd.jpeg","State":"VA","Country":"United States","Avg Beer Rating":3.8863636364,"Count":11,"Top Beer Rating":4.25,"Global Avg Rating":3.9633333333,"Diff":-0.076969697,"VORB":21.0337265578},
    {"name":"Belleflower Brewing","image_url":"https:\/\/assets.untappd.com\/site\/brewery_logos_hd\/brewery-492848_7c594_hd.jpeg","State":"ME","Country":"United States","Avg Beer Rating":3.75,"Count":3,"Top Beer Rating":4.25,"Global Avg Rating":4.0966666667,"Diff":-0.3466666667,"VORB":8.5434173669},
    {"name":"Foam Brewers","image_url":"https:\/\/assets.untappd.com\/site\/brewery_logos\/brewery-266666_c99e9.jpeg","State":"VT","Country":"United States","Avg Beer Rating":3.9,"Count":5,"Top Beer Rating":4.0,"Global Avg Rating":4.136,"Diff":-0.236,"VORB":7.8793561959},
    {"name":"CRAK Brewery","image_url":"https:\/\/assets.untappd.com\/site\/brewery_logos\/brewery-183551_66341.jpeg","State":"Veneto","Country":"Italy","Avg Beer Rating":3.8333333333,"Count":3,"Top Beer Rating":4.0,"Global Avg Rating":3.7966666667,"Diff":0.0366666667,"VORB":4.9719887955},
    {"name":"Aslin Beer Company","image_url":"https:\/\/assets.untappd.com\/site\/brewery_logos_hd\/brewery-170844_327db_hd.jpeg","State":"VA","Country":"United States","Avg Beer Rating":3.515625,"Count":16,"Top Beer Rating":4.25,"Global Avg Rating":3.923125,"Diff":-0.4075,"VORB":2.8284812183},
    {"name":"Spaten-Franziskaner-Löwenbräu-Gruppe","image_url":"https:\/\/assets.untappd.com\/site\/brewery_logos\/brewery-SpatenFranziskanerBrau_1176.jpeg","State":"Bavaria","Country":"Germany","Avg Beer Rating":3.6666666667,"Count":3,"Top Beer Rating":3.75,"Global Avg Rating":3.5766666667,"Diff":0.09,"VORB":1.979638009},
    {"name":"Skipping Rock Beer Co.","image_url":"https:\/\/assets.untappd.com\/site\/brewery_logos_hd\/brewery-406078_5cfac_hd.jpeg","State":"VA","Country":"United States","Avg Beer Rating":3.75,"Count":6,"Top Beer Rating":4.0,"Global Avg Rating":3.8666666667,"Diff":-0.1166666667,"VORB":-1.7657974121},
    {"name":"Night Shift Brewing","image_url":"https:\/\/assets.untappd.com\/site\/brewery_logos_hd\/brewery-20827_9c3db_hd.jpeg","State":"MA","Country":"United States","Avg Beer Rating":3.5833333333,"Count":3,"Top Beer Rating":4.25,"Global Avg Rating":3.8533333333,"Diff":-0.27,"VORB":-2.1708683473},
    {"name":"Redbeard Brewing","image_url":"https:\/\/assets.untappd.com\/site\/brewery_logos_hd\/brewery-20103_35407_hd.jpeg","State":"VA","Country":"United States","Avg Beer Rating":3.8333333333,"Count":3,"Top Beer Rating":4.0,"Global Avg Rating":4.1466666667,"Diff":-0.3133333333,"VORB":-2.2678018576},
    {"name":"Western Collective ","image_url":"https:\/\/assets.untappd.com\/site\/brewery_logos_hd\/brewery-400621_8c888_hd.jpeg","State":"ID","Country":"United States","Avg Beer Rating":3.5833333333,"Count":3,"Top Beer Rating":3.75,"Global Avg Rating":3.9966666667,"Diff":-0.4133333333,"VORB":-20.0280112045},
    {"name":"Devils Backbone Brewing Company","image_url":"https:\/\/assets.untappd.com\/site\/brewery_logos_hd\/brewery-4939_86d11_hd.jpeg","State":"VA","Country":"United States","Avg Beer Rating":3.4166666667,"Count":3,"Top Beer Rating":3.5,"Global Avg Rating":3.6133333333,"Diff":-0.1966666667,"VORB":-24.2156862745},
    {"name":"New Realm Brewing Co.","image_url":"https:\/\/assets.untappd.com\/site\/brewery_logos_hd\/brewery-373093_9cff3_hd.jpeg","State":"GA","Country":"United States","Avg Beer Rating":3.45,"Count":5,"Top Beer Rating":3.75,"Global Avg Rating":3.722,"Diff":-0.272,"VORB":-28.8619066047},
    {"name":"Sierra Nevada Brewing Co.","image_url":"https:\/\/assets.untappd.com\/site\/brewery_logos\/brewery-1142_ddcfe.jpeg","State":"CA","Country":"United States","Avg Beer Rating":3.4166666667,"Count":3,"Top Beer Rating":3.75,"Global Avg Rating":3.7066666667,"Diff":-0.29,"VORB":-30.7422969188},
    {"name":"Samuel Adams","image_url":"https:\/\/assets.untappd.com\/site\/brewery_logos_hd\/brewery-157_c3d1a_hd.jpeg","State":"MA","Country":"United States","Avg Beer Rating":3.1666666667,"Count":3,"Top Beer Rating":3.75,"Global Avg Rating":3.54,"Diff":-0.3733333333,"VORB":-39.2156862745}
];


var sortingDirections = {}; // Store sorting directions for each column

function sortTable(column) {
    var table, rows, switching, i, x, y, shouldSwitch;
    table = document.getElementById("breweryTable");
    switching = true;

    // Determine the sorting direction for this column
    if (!sortingDirections[column]) {
        // if column is brewry rating, sort descending
        if (column === 2) {
            sortingDirections[column] = "desc";
        } else {
            sortingDirections[column] = "asc";
        } 
    } else {
        sortingDirections[column] = sortingDirections[column] === "asc" ? "desc" : "asc";
    }

    while (switching) {
        switching = false;
        rows = table.rows;

        for (i = 0; i < rows.length - 1; i++) {
            shouldSwitch = false;

            x = rows[i].getElementsByTagName("td")[column];
            y = rows[i + 1].getElementsByTagName("td")[column];

            var shouldSortAsNumber = x.dataset.sort === "number";

            var xValue = shouldSortAsNumber ? parseFloat(x.textContent) : x.textContent.toLowerCase();
            var yValue = shouldSortAsNumber ? parseFloat(y.textContent) : y.textContent.toLowerCase();

            // Check if the rows should be switched
            if (
                (sortingDirections[column] === "asc" && xValue > yValue) ||
                (sortingDirections[column] === "desc" && xValue < yValue)
            ) {
                shouldSwitch = true;
                break;
            }
            
            // If Ranking values are equal, sort by brewery (ascending)
            if (xValue === yValue && column === 2) {
                var breweryX = rows[i].getElementsByTagName("td")[0].textContent;
                var breweryY = rows[i + 1].getElementsByTagName("td")[0].textContent;

                if (breweryX > breweryY) {
                    shouldSwitch = true;
                    break;
                }
            }
        }

        if (shouldSwitch) {
            rows[i].parentNode.insertBefore(rows[i + 1], rows[i]);
            switching = true;
        }
    }

    // Reset sorting indicators
    var headers = document.querySelectorAll(".sortable");
    for (var i = 0; i < headers.length; i++) {
        headers[i].classList.remove("asc", "desc");
    }

    // Set the sorting indicator on the clicked column
    var header = headers[column];
    header.classList.toggle(sortingDirections[column]);
}

var sortableHeaders = document.querySelectorAll(".sortable");

for (var i = 0; i < sortableHeaders.length; i++) {
    sortableHeaders[i].addEventListener("click", function () {
        var column = this.cellIndex;
        sortTable(column);
    });
}



// Access the "features" array within breweryObject
// var breweryFeatures = breweryObject.features;

// Populate the table with brewery data
var breweryTableBody = document.getElementById("breweryTable");

for (var i = 0; i < breweryObject.length; i++) {
    var brewery = breweryObject[i];
    var row = document.createElement("tr");

    // add image from image_url (100px)
    var imageCell = document.createElement("td");
    var image = document.createElement("img");
    image.src = brewery.image_url;
    image.width = 100;
    imageCell.appendChild(image);
    row.appendChild(imageCell);


    // Create and append table cells (td) for each property (name, Brewery Rating, State)
    var nameCell = document.createElement("td");
    nameCell.textContent = brewery.name;
    row.appendChild(nameCell);

    var ratingCell = document.createElement("td");
    ratingCell.textContent = brewery["VORB"].toFixed(0);
    ratingCell.dataset.sort = "number";
    row.appendChild(ratingCell);

    var countCell = document.createElement("td");
    countCell.textContent = brewery.Count;
    countCell.dataset.sort = "number";
    row.appendChild(countCell);

    // add my avg rating, top beer rating, and global avg rating
    var myAvgCell = document.createElement("td");
    myAvgCell.textContent = brewery["Avg Beer Rating"].toFixed(2);
    myAvgCell.dataset.sort = "number";
    row.appendChild(myAvgCell);

    var topBeerCell = document.createElement("td");
    topBeerCell.textContent = brewery["Top Beer Rating"].toFixed(2);
    topBeerCell.dataset.sort = "number";
    row.appendChild(topBeerCell);

    var globalAvgCell = document.createElement("td");
    globalAvgCell.textContent = brewery["Global Avg Rating"].toFixed(2);
    globalAvgCell.dataset.sort = "number";
    row.appendChild(globalAvgCell);

    var diffCell = document.createElement("td");
    diffCell.textContent = brewery["Diff"].toFixed(2);
    diffCell.dataset.sort = "number";
    row.appendChild(diffCell);

    var stateCell = document.createElement("td");
    stateCell.textContent = brewery.State;
    row.appendChild(stateCell);

    breweryTableBody.appendChild(row);
}

// Function to show the table
function showTable() {
    document.getElementById("brewery-container").style.display = "block";
    document.getElementById("chart-container").style.display = "none";
}

// Function to show the chart (replace this with your actual chart creation logic)
function showChart() {
    //document.getElementById("chart-container").innerHTML = "<img src='vorb_chart.png' alt='Chart Placeholder' style='width: 1000px; height: 100%;' >"; 
    document.getElementById("brewery-container").style.display = "none";
    document.getElementById("chart-container").style.display = "block";
}

// Initial call to show the table on page load
showTable();





