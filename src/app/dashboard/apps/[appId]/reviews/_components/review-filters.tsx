import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { territoryName } from "./territory-helpers";

interface ReviewFiltersProps {
  sortBy: string;
  onSortChange: (value: string) => void;
  dateFilter: string;
  onDateFilterChange: (value: string) => void;
  ratingFilter: string;
  onRatingFilterChange: (value: string) => void;
  territoryFilter: string;
  onTerritoryFilterChange: (value: string) => void;
  territories: string[];
  hideResponded: boolean;
  onHideRespondedChange: (value: boolean) => void;
}

export function ReviewFilters({
  sortBy,
  onSortChange,
  dateFilter,
  onDateFilterChange,
  ratingFilter,
  onRatingFilterChange,
  territoryFilter,
  onTerritoryFilterChange,
  territories,
  hideResponded,
  onHideRespondedChange,
}: ReviewFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select value={sortBy} onValueChange={onSortChange}>
        <SelectTrigger className="w-[140px] text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="newest">Newest first</SelectItem>
          <SelectItem value="oldest">Oldest first</SelectItem>
          <SelectItem value="highest">Highest rated</SelectItem>
          <SelectItem value="lowest">Lowest rated</SelectItem>
        </SelectContent>
      </Select>

      <Select value={dateFilter} onValueChange={onDateFilterChange}>
        <SelectTrigger className="w-[140px] text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All time</SelectItem>
          <SelectItem value="7d">Last 7 days</SelectItem>
          <SelectItem value="30d">Last 30 days</SelectItem>
          <SelectItem value="90d">Last 90 days</SelectItem>
          <SelectItem value="year">This year</SelectItem>
        </SelectContent>
      </Select>

      <Select value={ratingFilter} onValueChange={onRatingFilterChange}>
        <SelectTrigger className="w-[140px] text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All ratings</SelectItem>
          <SelectItem value="5">5 stars</SelectItem>
          <SelectItem value="4">4 stars</SelectItem>
          <SelectItem value="3">3 stars</SelectItem>
          <SelectItem value="2">2 stars</SelectItem>
          <SelectItem value="1">1 star</SelectItem>
        </SelectContent>
      </Select>

      <Select value={territoryFilter} onValueChange={onTerritoryFilterChange}>
        <SelectTrigger className="w-[160px] text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All territories</SelectItem>
          {territories.map((t) => (
            <SelectItem key={t} value={t}>
              {territoryName(t)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2">
        <Switch
          id="hide-responded"
          checked={hideResponded}
          onCheckedChange={onHideRespondedChange}
        />
        <Label htmlFor="hide-responded" className="text-sm">
          Hide responded
        </Label>
      </div>
    </div>
  );
}
