import { useEffect, useMemo, useState } from 'react';
import { useProperties } from './hooks/useProperties';
import { useTrails } from './hooks/useTrails';
import { usePois } from './hooks/usePois';
import { useVisibleCollections } from './hooks/useVisibleCollections';
import { useSearchFilters } from './hooks/useSearchFilters';
import { useSearch } from './hooks/useSearch';
import { useLocationSelection } from './hooks/useLocationSelection';
import { TopBar } from './components/TopBar';
import { MapView } from './components/MapView';
import { SidePanel } from './components/SidePanel';
import { EmptyState } from './components/EmptyState';
import { DiscoverToggle } from './components/DiscoverToggle';
import { FilterBar } from './components/FilterBar';
import { CandidateLayer, filterUnsavedCandidates } from './components/CandidateLayer';
import { PoiLayer } from './components/PoiLayer';
import { PromoteButton } from './components/PromoteButton';
import { UnsaveButton } from './components/UnsaveButton';
import { LocationSearchBox } from './components/LocationSearchBox';
import { pointInGeometry } from './lib/pointInPolygon';
import type { BBox } from './lib/bboxHysteresis';
import type { ApiCandidate, ApiPoi, ApiProperty } from './api';

function candidateAsProperty(c: ApiCandidate): ApiProperty {
  return {
    id: -c.id,
    provider: c.provider,
    externalId: c.externalId,
    name: c.name,
    url: c.url,
    lat: c.lat,
    lng: c.lng,
    priceLabel: c.priceLabel,
    photoUrl: c.photoUrl,
  };
}

export function App() {
  const [propertiesVersion, setPropertiesVersion] = useState(0);
  const propsState = useProperties(propertiesVersion);
  const trailsState = useTrails();
  const poisState = usePois();
  const [selectedPropertyId, setSelectedPropertyId] = useState<number | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<number | null>(null);
  const [hoveredTrailId, setHoveredTrailId] = useState<number | null>(null);
  const [hoveredPoiCarpark, setHoveredPoiCarpark] = useState<{
    poi: ApiPoi;
    carpark: { lat: number; lng: number };
  } | null>(null);
  const [hoveredRouteGeometry, setHoveredRouteGeometry] = useState<[number, number][] | null>(null);
  const [discoverEnabled, setDiscoverEnabled] = useState(false);
  const [bbox, setBbox] = useState<BBox | null>(null);
  const [promotedCount, setPromotedCount] = useState(0);
  const { filters, setFilter } = useSearchFilters();
  const location = useLocationSelection();

  const searchState = useSearch({ enabled: discoverEnabled, bbox, filters });

  const propertyList = propsState.status === 'success' ? propsState.data : [];
  const trailList = trailsState.status === 'success' ? trailsState.data : [];
  const poiList = poisState.status === 'success' ? poisState.data : [];

  const { isVisible: isCollectionVisible, toggle: toggleCollection } = useVisibleCollections();
  const visiblePoiList = useMemo(
    () => poiList.filter((p) => isCollectionVisible(p.collection)),
    [poiList, isCollectionVisible],
  );

  const candidates =
    discoverEnabled && searchState.status === 'success' ? searchState.candidates : [];
  const candidatesInRegion = useMemo(() => {
    if (!location.polygon) return candidates;
    return candidates.filter((c) => pointInGeometry(c.lat, c.lng, location.polygon));
  }, [candidates, location.polygon]);
  const unsavedCandidates = filterUnsavedCandidates(
    candidatesInRegion,
    propertyList.map((p) => ({ provider: p.provider, externalId: p.externalId })),
  );

  const selectedProperty = propertyList.find((p) => p.id === selectedPropertyId) ?? null;
  const selectedCandidate = unsavedCandidates.find((c) => c.id === selectedCandidateId) ?? null;
  const sidePanelTarget: ApiProperty | null = selectedProperty
    ? selectedProperty
    : selectedCandidate
      ? candidateAsProperty(selectedCandidate)
      : null;

  const isEmpty =
    propertyList.length === 0 && trailList.length === 0 && poiList.length === 0 && !discoverEnabled;

  useEffect(() => {
    if (!discoverEnabled) setSelectedCandidateId(null);
  }, [discoverEnabled]);

  function handlePromoted(propertyId: number) {
    setPromotedCount((n) => n + 1);
    setSelectedCandidateId(null);
    setSelectedPropertyId(propertyId);
    setPropertiesVersion((v) => v + 1);
  }

  function handleUnsaved() {
    setSelectedPropertyId(null);
    setPropertiesVersion((v) => v + 1);
  }

  return (
    <div className="bpm-app">
      <TopBar trails={trailList.length} properties={propertyList.length} cached={promotedCount} />
      <div className="bpm-discover-row">
        <LocationSearchBox
          selected={location.selected}
          onSelect={location.select}
          onClear={location.clear}
        />
        <DiscoverToggle enabled={discoverEnabled} onChange={setDiscoverEnabled} />
        {discoverEnabled && <FilterBar filters={filters} setFilter={setFilter} />}
        {discoverEnabled && searchState.status === 'loading' && (
          <span className="bpm-search-status">searching…</span>
        )}
        {discoverEnabled && searchState.status === 'success' && (
          <span className="bpm-search-status">
            {unsavedCandidates.length} new · {searchState.cached ? 'cached' : 'fresh'}
          </span>
        )}
      </div>
      {discoverEnabled && searchState.status === 'success' && searchState.warnings.length > 0 && (
        <output className="bpm-search-warnings">
          {searchState.warnings.map((w) => (
            <span key={w.provider} className="bpm-search-warning">
              <strong>{w.provider}</strong> failed: {w.message}
            </span>
          ))}
        </output>
      )}
      {discoverEnabled && searchState.status === 'error' && (
        <div className="bpm-search-warnings" role="alert">
          <span className="bpm-search-warning">
            Search request failed: {searchState.error.message}
          </span>
        </div>
      )}
      <main className="bpm-main">
        {isEmpty && <EmptyState />}
        {!isEmpty && (
          <MapView
            trails={trailList}
            properties={propertyList}
            selectedPropertyId={selectedPropertyId}
            hoveredTrailId={hoveredTrailId}
            hoveredPoiCarpark={hoveredPoiCarpark}
            hoveredRouteGeometry={hoveredRouteGeometry}
            onSelectProperty={(id) => {
              setSelectedPropertyId(id);
              if (id !== null) setSelectedCandidateId(null);
            }}
            onBoundsChange={setBbox}
            flyToBbox={location.selected?.bbox ?? null}
            regionPolygon={location.polygon}
          >
            {visiblePoiList.length > 0 && <PoiLayer pois={visiblePoiList} />}
            {discoverEnabled && (
              <CandidateLayer
                candidates={unsavedCandidates}
                savedProperties={propertyList}
                onSelectCandidate={(id) => {
                  setSelectedCandidateId(id);
                  if (id !== null) setSelectedPropertyId(null);
                }}
              />
            )}
          </MapView>
        )}
        <SidePanel
          property={sidePanelTarget}
          trails={trailList}
          pois={poiList}
          isCollectionVisible={isCollectionVisible}
          onToggleCollection={toggleCollection}
          onClose={() => {
            setSelectedPropertyId(null);
            setSelectedCandidateId(null);
          }}
          onHoverTrail={(trailId, geometry) => {
            setHoveredTrailId(trailId);
            setHoveredRouteGeometry(trailId === null ? null : geometry);
          }}
          onHoverPoi={(poi, carpark, geometry) => {
            if (poi && carpark) setHoveredPoiCarpark({ poi, carpark });
            else setHoveredPoiCarpark(null);
            setHoveredRouteGeometry(poi === null ? null : geometry);
          }}
          extraAction={
            selectedCandidate ? (
              <PromoteButton candidateId={selectedCandidate.id} onPromoted={handlePromoted} />
            ) : selectedProperty ? (
              <UnsaveButton propertyId={selectedProperty.id} onUnsaved={handleUnsaved} />
            ) : null
          }
        />
      </main>
    </div>
  );
}
