using System;
using Core.Game;
using Core.Items;
using UnityEngine;

namespace Plants
{
    // TODO: Maybe take apart seed, growth stages and plant item into separate classes...

    [CreateAssetMenu(fileName = "PlantItem", menuName = "Game/Items/Plants/PlantItem", order = 1)]
    public class SeedItem : PlaceableItem
    {
        public PlantData plantData;

        public override GameObject GetPlaceableRepresentation()
        {
            var seedStage = plantData.GetSeedStage();
            if (seedStage == null)
            {
                throw new Exception("No seed stage (daysToReachStage = 0) defined for plant item " + name);
            }
            return seedStage.representation.CreateInstance();
        }
        
        
        // public override bool Use(string playerID)
        // { 
        //     var character = (UrLevelManager.Current as UrLevelManager)!.GetPlayerById(playerID);
        //     var tileInFrontOfPlayer = character.TileDataInFront;
        //     if (tileInFrontOfPlayer == null)
        //     {
        //         Debug.LogError("PlaceableItem.Drop: No tile in front of character to place item on.");
        //         return false;
        //     }
        //     /// placeableOnTerrainTypes.Contains(tileInFrontOfPlayer.TerrainData.TerrainType
        //     if (true)
        //     {
        //         PlantManager.Current.SowPlantOnCurrentMap(tileInFrontOfPlayer.Coordinates, plantData.plantId);
        //         return true;
        //     }
        //     return false;
        // }
    }
}