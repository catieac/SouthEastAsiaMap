import { Colord } from "colord";
import { Theme } from "../../../core/configuration/Config";
import { Unit, UnitEvent, Cell, Game, Tile, UnitType, getUnitTypeKey } from "../../../core/game/Game";
import { bfs, dist, euclDist } from "../../../core/Util";
import { Layer } from "./Layer";
import { EventBus } from "../../../core/EventBus";

import anchorIcon from '../../../../resources/images/AnchorIcon.png';
import missileSiloIcon from '../../../../resources/images/MissileSiloUnit.png';
import { UnitTypeKey } from '../../../core/game/Game';

interface UnitRenderConfig {
    icon: string;
    borderRadius: number;
    territoryRadius: number;
}


export class StructureLayer implements Layer {
    private canvas: HTMLCanvasElement;
    private context: CanvasRenderingContext2D;
    private imageData: ImageData;
    private unitImages: Map<string, HTMLImageElement> = new Map();
    private theme: Theme = null;

    // Configuration for supported unit types only
    private readonly unitConfigs: Partial<Record<UnitTypeKey, UnitRenderConfig>> = {
        Port: {
            icon: anchorIcon,
            borderRadius: 8,
            territoryRadius: 6
        },
        MissileSilo: {
            icon: missileSiloIcon,
            borderRadius: 8,
            territoryRadius: 6
        }
    };

    constructor(private game: Game, private eventBus: EventBus) {
        this.theme = game.config().theme();
        this.loadUnitImages();
    }

    private loadUnitImages() {
        Object.entries(this.unitConfigs).forEach(([unitType, config]) => {
            const image = new Image();
            image.src = config.icon;
            image.onload = () => {
                this.unitImages.set(unitType, image);
            };
        });
    }

    shouldTransform(): boolean {
        return true;
    }

    tick() {
    }

    init(game: Game) {
        this.canvas = document.createElement('canvas');
        this.context = this.canvas.getContext("2d");

        this.imageData = this.context.getImageData(0, 0, this.game.width(), this.game.height());
        this.canvas.width = this.game.width();
        this.canvas.height = this.game.height();
        this.context.putImageData(this.imageData, 0, 0);
        this.initImageData();

        this.eventBus.on(UnitEvent, e => this.onUnitEvent(e));
    }

    initImageData() {
        this.game.forEachTile((tile) => {
            const index = (tile.cell().y * this.game.width()) + tile.cell().x;
            const offset = index * 4;
            this.imageData.data[offset + 3] = 0;
        });
    }

    renderLayer(context: CanvasRenderingContext2D) {
        this.context.putImageData(this.imageData, 0, 0);
        context.drawImage(
            this.canvas,
            -this.game.width() / 2,
            -this.game.height() / 2,
            this.game.width(),
            this.game.height()
        );
    }

    private isUnitTypeSupported(unitType: UnitTypeKey): boolean {
        return unitType in this.unitConfigs;
    }

    private handleUnitRendering(event: UnitEvent) {
        const unitType = event.unit.type();
        const key = getUnitTypeKey(unitType)
        if (!this.isUnitTypeSupported(key)) return;

        const config = this.unitConfigs[key];
        const unitImage = this.unitImages.get(key);

        if (!config || !unitImage) return;

        // Clear previous rendering
        bfs(event.unit.tile(), euclDist(event.unit.tile(), config.borderRadius))
            .forEach(t => this.clearCell(t.cell()));

        if (!event.unit.isActive()) {
            return;
        }

        // Create temporary canvas for icon processing
        const tempCanvas = document.createElement('canvas');
        const tempContext = tempCanvas.getContext('2d');
        tempCanvas.width = unitImage.width;
        tempCanvas.height = unitImage.height;

        // Draw the unit icon
        tempContext.drawImage(unitImage, 0, 0);
        const iconData = tempContext.getImageData(0, 0, tempCanvas.width, tempCanvas.height);

        const cell = event.unit.tile().cell();
        const startX = cell.x - Math.floor(tempCanvas.width / 2);
        const startY = cell.y - Math.floor(tempCanvas.height / 2);

        // Draw border and territory
        bfs(event.unit.tile(), euclDist(event.unit.tile(), config.borderRadius))
            .forEach(t => this.paintCell(t.cell(), this.theme.borderColor(event.unit.owner().info()), 255));

        bfs(event.unit.tile(), euclDist(event.unit.tile(), config.territoryRadius))
            .forEach(t => this.paintCell(t.cell(), this.theme.territoryColor(event.unit.owner().info()), 255));

        // Draw the icon
        this.renderIcon(iconData, startX, startY, tempCanvas.width, tempCanvas.height, event.unit);
    }

    private renderIcon(
        iconData: ImageData,
        startX: number,
        startY: number,
        width: number,
        height: number,
        unit: Unit
    ) {
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const iconIndex = (y * width + x) * 4;
                const alpha = iconData.data[iconIndex + 3];

                if (alpha > 0) {
                    const targetX = startX + x;
                    const targetY = startY + y;

                    if (targetX >= 0 && targetX < this.game.width() &&
                        targetY >= 0 && targetY < this.game.height()) {
                        this.paintCell(
                            new Cell(targetX, targetY),
                            this.theme.borderColor(unit.owner().info()),
                            alpha
                        );
                    }
                }
            }
        }
    }

    onUnitEvent(event: UnitEvent) {
        this.handleUnitRendering(event);
    }

    paintCell(cell: Cell, color: Colord, alpha: number) {
        const index = (cell.y * this.game.width()) + cell.x;
        const offset = index * 4;
        this.imageData.data[offset] = color.rgba.r;
        this.imageData.data[offset + 1] = color.rgba.g;
        this.imageData.data[offset + 2] = color.rgba.b;
        this.imageData.data[offset + 3] = alpha;
    }

    clearCell(cell: Cell) {
        const index = (cell.y * this.game.width()) + cell.x;
        const offset = index * 4;
        this.imageData.data[offset + 3] = 0;
    }
}