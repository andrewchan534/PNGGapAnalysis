# PNG Biodiversity and Genebank Gap Explorer

Interactive local website for exploring Papua New Guinea biodiversity records,
Genesys PGR accession holdings, and CMIP6 future climate layers for vegetable
crop and locally important food-plant collecting gap analysis.

## Purpose and Screening Preference

This dashboard is intentionally **not** an unbiased hotspot map for all Papua
New Guinea biodiversity. It is a targeted collecting-planning tool for
pre-selected vegetable crop, edible fern, and locally important food-plant
taxa.

The target list is defined in `scripts/prepare_site_data.py` with three levels:

- `VEGETABLE_SPECIES`: exact target species.
- `VEGETABLE_GENERA`: genus-level targets. Names written as `spp.` are treated
  as genus-level targets, for example `Cucumis spp.` means the whole `Cucumis`
  genus.
- `VEGETABLE_FAMILIES`: family-level targets, currently including
  `Cucurbitaceae` and `Malvaceae`.

Only GBIF and Genesys records matching those target species, genera, or
families are used for the vegetable collecting recommendation layers. Taxa that
do not match the target list are excluded from the collecting-priority logic
even if they are common or biologically important in PNG. This design reflects a
genebank collecting preference for vegetable genetic resources, not a neutral
survey of all biodiversity.

## Inputs

- `GBIF download data.csv`: GBIF occurrence export. The file is tab-separated
  even though the extension is `.csv`.
- `genesys-accessions-v2eEqXZP0G9.xlsx`: Genesys PGR MCPD accession export.

## Generated Website

- Website root: `site/`
- Main page: `site/index.html`
- Aggregated data: `site/data/`
- Downloaded climate rasters: `site/data/climate/`

## Deployment Layout

The GitHub deployment package is structured so the site can live in its own
folder under a shared web root:

```text
www/html/
  PNGGapAnalysis/
    index.html
    PNGGapAnalysis.html
    PNGGapAnalysis.app.js
    PNGGapAnalysis.styles.css
    data/
```

This avoids collisions with other web tools in the same `www/html` directory,
such as `seedcounter.html` and any other project-level JavaScript or CSS files.
The preferred public URL is:

```text
https://genebank.worldveg.org/PNGGapAnalysis/
```

The direct HTML URL is:

```text
https://genebank.worldveg.org/PNGGapAnalysis/PNGGapAnalysis.html
```

The climate build uses WorldClim CMIP6 10-minute GeoTIFFs:

- Model: `ACCESS-CM2`
- Scenario: `SSP245`
- Period: `2041-2060`
- Layers: annual precipitation, mean monthly maximum temperature, and mean
  monthly minimum temperature

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
- Recommended collection site cells: 300
- Recommended crop/genus candidates: 111

## Mapping Logic

All point-based biodiversity and genebank records are aggregated into 0.25
degree grid cells within the PNG bounding box (`south=-12`, `west=140`,
`north=0`, `east=160`). The grid is used to compare three evidence streams at a
common spatial resolution:

- GBIF occurrence density and species richness for target vegetable taxa.
- Genesys PGR accession density for coordinate-backed holdings.
- Climate conditions and future-minus-current climate-change rasters.

GBIF and Genesys grids use counts in each 0.25 degree cell. Genesys accession
points are also available as a separate point layer. The point layer uses all
coordinate-backed Genesys accessions inside the PNG bounding box.

## Climate Logic

The selectable CMIP6 climate layer shows future climate from WorldClim CMIP6
`ACCESS-CM2 / SSP245 / 2041-2060`. The climate-change hotspot layer is a
separate raster overlay that compares current and future climate:

- Rainfall change = future annual precipitation minus WorldClim v2.1 baseline
  annual precipitation.
- Annual mean temperature change = future `(tmin + tmax) / 2` minus WorldClim
  v2.1 baseline `tavg`.

The climate-change hotspot is purely climate based. It does not use Genesys,
GBIF site polygons, or collection gap scores. It renders future-minus-current
climate as a continuous raster overlay. Rainfall change uses a divergent color
scale for decreases and increases; temperature change uses a low-to-high
increase scale. These overlays are precomputed by
`scripts/precompute_climate_change.py` into:

- `site/data/climate/change_precip.png`
- `site/data/climate/change_temp.png`

Precomputing these layers keeps the browser from processing the full baseline
GeoTIFF stack interactively.

## Recommendation Logic

Recommended collection sites are 0.25 degree grid cells ranked by high target
vegetable GBIF evidence and low target vegetable Genesys evidence in the same
cell. Cells with no or few vegetable Genesys accessions receive higher
collection priority when GBIF evidence is strong.

The `Suggested Vegetable Collection Sites` section contains three stackable
heatmap views:

- **GBIF-rich, Genesys-poor sites**: high target vegetable GBIF record/species
  evidence, discounted by Genesys accessions in the same grid cell.
- **High warming, Genesys-poor sites**: high annual mean temperature increase,
  discounted by Genesys collection coverage.
- **Extreme rainfall-change, Genesys-poor sites**: large positive or negative
  rainfall change, discounted by Genesys collection coverage.

A fourth **Weighted collection priority** layer combines those three normalized
scores. Users can set separate weights for:

- GBIF gap evidence.
- Temperature-change evidence.
- Rainfall-change evidence.

The combined priority score is a weighted average of the three component
scores. Changing the sliders immediately changes the weighted layer and the
ranked site preview table.

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

## Website Features

- **Layer controls**: all map layers start unchecked when the page is opened or
  refreshed. Users choose which layers to display.
- **CMIP6 climate layer**: selectable future annual precipitation, maximum
  temperature, or minimum temperature raster, with opacity control.
- **Climate change hotspot**: independent rainfall-change or annual mean
  temperature-change raster, with opacity control and legend.
- **GBIF hotspot grid**: grid-cell density of GBIF records and richness.
- **Genesys holding grid**: grid-cell density of Genesys PGR accessions.
- **Genesys accession points**: full coordinate-backed accession point layer.
- **Suggested Vegetable Collection Sites**: three stackable evidence layers plus
  the weighted final recommendation layer.
- **Weighted controls**: sliders for GBIF gap, temperature change, and rainfall
  change weights.
- **Recommended Vegetables**: genus-level table showing GBIF and Genesys
  representation for target vegetable taxa.
- **Suggested Site Preview**: ranked GPS locations sorted by the current
  weighted priority score. The table retains likely target species for each
  collection cell and can be downloaded as an Excel file.
- **All Genus Gaps**: broader genus-level gap table for review.
- **Sources**: data provenance links and notes for GBIF, Genesys, WorldClim
  CMIP6, and IPCC Atlas provenance.

## Interpretation Notes

High-priority cells should be read as **screening candidates**, not automatic
field-collection decisions. Before field work, the list still needs taxonomic
review, local partner input, permit checks, site accessibility review, and
assessment of whether the GBIF records represent wild relatives, cultivated
material, herbarium records, or other occurrence types.

## Source Notes

WorldClim CMIP6 data are downscaled CMIP6 projections. The site also cites the
IPCC WGI AR6 Atlas repository for IPCC Atlas transparency/provenance, but the
web-ready raster layers are downloaded from WorldClim because they are easier to
crop and serve in this local website.
