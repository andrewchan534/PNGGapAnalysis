# PNG Biodiversity and Genebank Gap Explorer

Interactive local website for exploring Papua New Guinea biodiversity records,
Genesys PGR accession holdings, and CMIP6 future climate layers.

## Inputs

- `GBIF download data.csv`: GBIF occurrence export. The file is tab-separated
  even though the extension is `.csv`.
- `genesys-accessions-v2eEqXZP0G9.xlsx`: Genesys PGR MCPD accession export.

## Generated Website

- Website root: `site/`
- Main page: `site/index.html`
- Aggregated data: `site/data/`
- Downloaded climate rasters: `site/data/climate/`

The first climate build uses WorldClim CMIP6 10-minute GeoTIFFs:

- Model: `ACCESS-CM2`
- Scenario: `SSP245`
- Period: `2041-2060`
- Layers: annual precipitation and mean monthly maximum temperature

The browser reads the local GeoTIFF files with `geotiff.js` and renders the
Papua New Guinea crop as a Leaflet image overlay.

## Rebuild Data

```powershell
& 'C:\Users\andrew.chan\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts\prepare_site_data.py
```

The script preserves the source files and rewrites only `site/data/`.

## Run Locally

```powershell
& 'C:\Users\andrew.chan\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m http.server 8765 -d site
```

Then open:

```text
http://localhost:8765/
```

## Current Data Summary

- GBIF rows: 425,275
- GBIF rows mapped inside PNG bounding box: 425,057
- GBIF species names: 13,182
- Genesys accessions: 2,953
- Genesys accessions with coordinates inside PNG bounding box: 786
- Recommended collection site cells: 194
- Recommended crop/genus candidates: 120

## Recommendation Logic

Recommended collection sites are 0.25 degree grid cells ranked by high
vegetable-target GBIF record/species density and low vegetable-target Genesys
coordinate-backed accession density in the same grid cell. Cells with no
vegetable Genesys accessions receive the strongest priority when GBIF evidence
is high.

The climate-risk view further ranks uncollected cells by climate change over
the next planning horizon. The current implementation compares WorldClim v2.1
baseline climate with WorldClim CMIP6 `ACCESS-CM2 / SSP245 / 2041-2060`.
Rainfall change is future annual precipitation minus baseline annual
precipitation. Annual mean temperature change is future `(tmin + tmax) / 2`
minus baseline `tavg`.

The website lets the user choose:

- Rainfall change or annual mean temperature change for site ranking.
- How many hotspot species to show for each recommended collection cell.

The climate-change hotspot is shown as an independent raster overlay. It is
purely climate based and does not use Genesys, GBIF site polygons, or collection
gap scores. It renders future climate minus current climate as a continuous
blue-to-red heatmap. The overlays are precomputed by
`scripts/precompute_climate_change.py` into `site/data/climate/change_precip.png`
and `site/data/climate/change_temp.png`, so the browser does not need to process
large GeoTIFF stacks interactively.

Recommended vegetables are ranked at genus level because both GBIF and Genesys
carry usable genus fields. The score rewards high vegetable-target GBIF
occurrence volume and broad geographic spread, then discounts genera already
well represented in Genesys. The vegetable target list is defined in
`scripts/prepare_site_data.py` using `VEGETABLE_SPECIES`, `VEGETABLE_GENERA`,
and `VEGETABLE_FAMILIES`; names written as `spp.` are treated as genus-level
targets. This is a screening list for planning, not a substitute for taxonomic
review, permit checks, local partner input, or field feasibility assessment.

The current vegetable target list explicitly includes soybean, mung bean,
cowpea, pigeon pea, winged bean, selected mallow/hibiscus vegetables,
Cucurbitaceae vegetables including pumpkin/squash and wax gourd, amaranths,
edible Solanum vegetables, selected edible ferns, and additional locally
important vegetable taxa requested for Papua New Guinea screening.

The `Suggested Vegetable Collection Sites` section contains three stackable
heatmap views: GBIF-rich/Genesys-poor vegetable sites, high-warming/Genesys-poor
vegetable sites, and extreme-rainfall-change/Genesys-poor vegetable sites. A
fourth weighted-priority layer combines those three normalized scores with
user-controlled weights, producing a final suggested vegetable collecting
hotspot layer.

## Source Notes

WorldClim CMIP6 data are downscaled CMIP6 projections. The site also cites the
IPCC WGI AR6 Atlas repository for IPCC Atlas transparency/provenance, but the
web-ready raster layers are downloaded from WorldClim because they are easier to
crop and serve in this local website.
