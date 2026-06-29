# PNG Gap Analysis

Static deployment package for the Papua New Guinea biodiversity, Genesys PGR,
and climate gap-analysis dashboard.

## Server Deployment

Place or pull this repository into the web root that serves
`https://genebank.worldveg.org/`, then open:

```text
https://genebank.worldveg.org/PNGGapAnalysis.html
```

The dashboard expects these files and folders to stay beside
`PNGGapAnalysis.html`:

- `app.js`
- `styles.css`
- `data/`

The repository intentionally excludes the large WorldClim baseline source
archives and extracted baseline GeoTIFFs. The web app uses precomputed climate
change PNG overlays plus the CMIP6 future GeoTIFFs needed for the selectable
future climate layer.
