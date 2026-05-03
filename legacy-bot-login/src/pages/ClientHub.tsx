import { useLocation } from "react-router-dom";
import CardDetailView from "../modules/modal/components/card-detail/CardDetailView";
import { Lead } from "@/services/api";

const ClientHub = () => {
    const location = useLocation();
    const lead = location.state?.lead as (Lead & Record<string, unknown>) | undefined;

    return <CardDetailView initialLead={lead} />;
};


export default ClientHub;
