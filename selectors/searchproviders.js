/**
 * Copyright 2020-2024 Sourcepole AG
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {createSelector} from 'reselect';

import {LayerRole} from '../actions/layers';
import ConfigUtils from '../utils/ConfigUtils';
import LocaleUtils from '../utils/LocaleUtils';
import SearchProviders from '../utils/SearchProviders';
import ThemeUtils from '../utils/ThemeUtils';
import VectorLayerUtils from '../utils/VectorLayerUtils';

// Uniformize the response of getResultGeometry
function getResultGeometry(provider, item, callback) {
    provider.getResultGeometry(item, (response) => {
        const features = [];
        if (response?.geometry) {
            const highlightFeature = response.geometry.coordinates ? {
                type: "Feature", geometry: response.geometry
            } : VectorLayerUtils.wktToGeoJSON(response.geometry, response.crs, response.crs);
            if (highlightFeature) {
                features.push(highlightFeature);
            }
        } else if (response?.feature) {
            if (response.feature.features) {
                features.push(...response.feature.features);
            } else {
                features.push(response.feature);
            }
        }
        if (features.length === 0) {
            callback(null);
        } else {
            callback({
                feature: {
                    type: "FeatureCollection",
                    features: features
                },
                crs: response.crs,
                hidemarker: response.hidemarker
            });
        }
    });
}

export default createSelector(
    [state => state.theme, state => state.layers && state.layers.flat || null], (theme, layers) => {
        const searchProviders = {...SearchProviders, ...window.QWC2SearchProviders || {}};
        const availableProviders = {};
        const themeLayerNames = layers.map(layer => layer.role === LayerRole.THEME ? layer.params.LAYERS : "").join(",").split(",").filter(entry => entry);
        const themeProviders = theme && theme.current && theme.current.searchProviders ? theme.current.searchProviders : [];
        const providerKeys = new Set();
        for (let entry of themeProviders) {
            if (typeof entry === 'string') {
                entry = {provider: entry};
            }
            // Omit qgis provider with field configuration, this is only supported through the FeatureSearch plugin
            if (entry.provider === 'qgis' && entry?.params?.fields) {
                continue;
            }
            const provider = searchProviders[entry.provider];
            if (provider) {
                if (provider.requiresLayer && !themeLayerNames.includes(provider.requiresLayer)) {
                    continue;
                }
                let key = entry.key ?? entry.provider;
                if (providerKeys.has(key)) {
                    let i = 0;
                    for (i = 0; providerKeys.has(key + "_" + i); ++i);
                    key = key + "_" + i;
                }
                providerKeys.add(key);
                availableProviders[key] = {
                    ...provider,
                    label: entry.label ?? provider.label,
                    labelmsgid: entry.labelmsgid ?? provider.labelmsgid,
                    getResultGeometry: provider.getResultGeometry ? (item, callback) => getResultGeometry(provider, item, callback) : null,
                    params: {...entry.params}
                };
            }
        }
        if (ConfigUtils.getConfigProp("searchThemes", theme)) {
            availableProviders.themes = {
                labelmsgid: LocaleUtils.trmsg("search.themes"),
                onSearch: (text, options, callback) => {
                    callback({results: ThemeUtils.searchThemes(theme.themes, text)});
                }
            };
        }
        if (ConfigUtils.getConfigProp("searchThemeLayers", theme)) {
            availableProviders.themelayers = {
                labelmsgid: LocaleUtils.trmsg("search.themelayers"),
                onSearch: (text, options, callback) => {
                    callback({results: ThemeUtils.searchThemeLayers(theme.themes, text)});
                }
            };
        }
        return availableProviders;
    }
);
